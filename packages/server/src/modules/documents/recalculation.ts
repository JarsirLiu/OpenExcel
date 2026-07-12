import {
  type CellRange,
  type DocumentCell,
  type DocumentChunk,
  decodeDocumentJson,
  encodeDocumentJson,
  type FormulaReference,
  formatA1Cell,
  getChunkKey,
  getChunkPosition,
  parseA1Cell,
} from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";
import { type CalculationCellResult, FormulaCalculationEngine } from "./calculationEngine.js";

interface StoredFormula {
  sheetId: number;
  address: string;
  formula: string;
  dependencies: FormulaReference[];
}

interface PendingRange {
  sheetId: number;
  range: CellRange;
}

function formulaCellRange(formula: StoredFormula): CellRange | null {
  try {
    const cell = parseA1Cell(formula.address);
    return { startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col };
  } catch {
    return null;
  }
}

function decodeDependencies(data: Uint8Array<ArrayBufferLike> | null): FormulaReference[] {
  if (!data) return [];
  try {
    const dependencies = decodeDocumentJson<FormulaReference[]>(data);
    return Array.isArray(dependencies) ? dependencies : [];
  } catch {
    return [];
  }
}

function cellInRanges(row: number, col: number, ranges: CellRange[]): boolean {
  return ranges.some(
    (range) =>
      row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol,
  );
}

function addRequiredRange(map: Map<number, CellRange[]>, sheetId: number, range: CellRange) {
  const ranges = map.get(sheetId) ?? [];
  ranges.push(range);
  map.set(sheetId, ranges);
}

function toCachedValue(result: CalculationCellResult) {
  return encodeDocumentJson({ value: result.value, error: result.error ?? null });
}

function toDisplayValue(value: CalculationCellResult["value"]): string {
  return value == null ? "" : String(value);
}

export async function recalculateAffectedFormulas(
  tx: Prisma.TransactionClient,
  workbookId: number,
  changedRanges: PendingRange[],
  revision: number,
): Promise<CalculationCellResult[]> {
  if (changedRanges.length === 0) return [];

  const sheets = await tx.sheet.findMany({
    where: { workbookId },
    select: { id: true, name: true },
  });
  if (sheets.length === 0) return [];

  const sheetIdsByName = new Map(sheets.map((sheet) => [sheet.name, sheet.id]));
  const targetKeys = new Set<string>();
  let frontier = changedRanges;

  while (frontier.length > 0) {
    const dependencyRows = await tx.formulaDependency.findMany({
      where: {
        OR: frontier.map((change) => ({
          sourceSheetId: change.sheetId,
          startRow: { lte: change.range.endRow },
          endRow: { gte: change.range.startRow },
          startCol: { lte: change.range.endCol },
          endCol: { gte: change.range.startCol },
        })),
      },
      select: { targetSheetId: true, targetAddress: true },
    });
    const nextFrontier: PendingRange[] = [];
    for (const dependency of dependencyRows) {
      const key = `${dependency.targetSheetId}:${dependency.targetAddress}`;
      if (targetKeys.has(key)) continue;
      targetKeys.add(key);
      try {
        const cell = parseA1Cell(dependency.targetAddress);
        const range = {
          startRow: cell.row,
          startCol: cell.col,
          endRow: cell.row,
          endCol: cell.col,
        };
        nextFrontier.push({ sheetId: dependency.targetSheetId, range });
      } catch {
        // Ignore malformed index entries; the formula row remains untouched.
      }
    }

    if (frontier === changedRanges) {
      const directRows = await tx.formulaCell.findMany({
        where: {
          OR: changedRanges.map((change) => ({
            sheetId: change.sheetId,
            row: { gte: change.range.startRow, lte: change.range.endRow },
            col: { gte: change.range.startCol, lte: change.range.endCol },
          })),
        },
        select: { sheetId: true, address: true },
      });
      for (const formula of directRows) {
        const key = `${formula.sheetId}:${formula.address}`;
        if (targetKeys.has(key)) continue;
        targetKeys.add(key);
        const ownRange = formulaCellRange({ ...formula, formula: "", dependencies: [] });
        if (ownRange) {
          nextFrontier.push({ sheetId: formula.sheetId, range: ownRange });
        }
      }
    }
    frontier = nextFrontier;
  }

  if (targetKeys.size === 0) return [];

  const formulaRows = await tx.formulaCell.findMany({
    where: {
      OR: [...targetKeys].map((key) => {
        const separator = key.indexOf(":");
        return { sheetId: Number(key.slice(0, separator)), address: key.slice(separator + 1) };
      }),
    },
    select: { sheetId: true, address: true, formula: true, dependencies: true },
  });
  const formulas: StoredFormula[] = formulaRows.map((row) => ({
    sheetId: row.sheetId,
    address: row.address,
    formula: row.formula,
    dependencies: decodeDependencies(row.dependencies),
  }));
  const affected = new Map(
    formulas.map((formula) => [`${formula.sheetId}:${formula.address}`, formula]),
  );
  if (affected.size === 0) return [];

  const requiredRanges = new Map<number, CellRange[]>();
  for (const formula of affected.values()) {
    const ownRange = formulaCellRange(formula);
    if (ownRange) addRequiredRange(requiredRanges, formula.sheetId, ownRange);
    for (const dependency of formula.dependencies) {
      const dependencySheetId = dependency.sheetName
        ? sheetIdsByName.get(dependency.sheetName)
        : formula.sheetId;
      if (dependencySheetId !== undefined) {
        addRequiredRange(requiredRanges, dependencySheetId, dependency.range);
      }
    }
  }

  const chunksBySheet = new Map<number, DocumentChunk[]>();
  for (const [sheetId, ranges] of requiredRanges) {
    const first = ranges.reduce(
      (current, range) => {
        const position = getChunkPosition(range.startRow, range.startCol);
        return {
          rowBlock: Math.min(current.rowBlock, position.rowBlock),
          colBlock: Math.min(current.colBlock, position.colBlock),
        };
      },
      { rowBlock: Number.POSITIVE_INFINITY, colBlock: Number.POSITIVE_INFINITY },
    );
    const last = ranges.reduce(
      (current, range) => {
        const position = getChunkPosition(range.endRow, range.endCol);
        return {
          rowBlock: Math.max(current.rowBlock, position.rowBlock),
          colBlock: Math.max(current.colBlock, position.colBlock),
        };
      },
      { rowBlock: -1, colBlock: -1 },
    );
    const rows = await tx.sheetChunk.findMany({
      where: {
        sheetId,
        rowBlock: { gte: first.rowBlock, lte: last.rowBlock },
        colBlock: { gte: first.colBlock, lte: last.colBlock },
      },
    });
    chunksBySheet.set(
      sheetId,
      rows.map((row) => ({
        rowBlock: row.rowBlock,
        colBlock: row.colBlock,
        revision: row.revision,
        codec: row.codec as DocumentChunk["codec"],
        cells: decodeDocumentJson<{ cells: DocumentChunk["cells"] }>(row.data).cells ?? {},
      })),
    );
  }

  const cellsBySheet = new Map<number, DocumentCell[]>();
  for (const [sheetId, ranges] of requiredRanges) {
    const cells: DocumentCell[] = [];
    for (const chunk of chunksBySheet.get(sheetId) ?? []) {
      for (const [key, value] of Object.entries(chunk.cells)) {
        const [rowOffset, colOffset] = key.split(",").map(Number);
        const row = chunk.rowBlock * 128 + rowOffset;
        const col = chunk.colBlock * 64 + colOffset;
        if (cellInRanges(row, col, ranges)) cells.push({ row, col, value });
      }
    }
    cellsBySheet.set(sheetId, cells);
  }

  for (const formula of affected.values()) {
    const address = formulaCellRange(formula);
    if (!address) continue;
    const cells = cellsBySheet.get(formula.sheetId) ?? [];
    const existing = cells.find(
      (cell) => cell.row === address.startRow && cell.col === address.startCol,
    );
    if (!existing) {
      cells.push({
        row: address.startRow,
        col: address.startCol,
        value: { value: null, formula: formula.formula },
      });
    } else if (!existing.value.formula) {
      existing.value = { ...existing.value, formula: formula.formula };
    }
  }

  const sheetNamesById = new Map(sheets.map((sheet) => [sheet.id, sheet.name]));
  const engine = new FormulaCalculationEngine(
    sheets.map((sheet) => ({ name: sheet.name, cells: cellsBySheet.get(sheet.id) ?? [] })),
  );
  try {
    const results = [...affected.values()]
      .map((formula) => {
        const cell = formulaCellRange(formula);
        const sheetName = sheetNamesById.get(formula.sheetId);
        if (!cell || !sheetName) return null;
        return engine.calculateFormula(sheetName, cell.startRow, cell.startCol);
      })
      .filter((result): result is CalculationCellResult => result !== null);

    for (const result of results) {
      const sheetId = sheetIdsByName.get(result.sheetName);
      if (sheetId === undefined) continue;
      const position = getChunkPosition(result.row, result.col);
      const chunkKey = getChunkKey(position.rowBlock, position.colBlock);
      const chunk = chunksBySheet
        .get(sheetId)
        ?.find((candidate) => getChunkKey(candidate.rowBlock, candidate.colBlock) === chunkKey);
      if (!chunk) continue;
      const cellKey = `${position.rowOffset},${position.colOffset}`;
      const current = chunk.cells[cellKey];
      chunk.cells[cellKey] = {
        ...(current ?? {}),
        value: result.value,
        displayValue: toDisplayValue(result.value),
        ...(result.formula ? { formula: result.formula } : {}),
      };

      await tx.sheetChunk.upsert({
        where: {
          sheetId_rowBlock_colBlock: {
            sheetId,
            rowBlock: position.rowBlock,
            colBlock: position.colBlock,
          },
        },
        create: {
          sheetId,
          rowBlock: position.rowBlock,
          colBlock: position.colBlock,
          revision,
          codec: "json-v1",
          data: encodeDocumentJson({ cells: chunk.cells }),
        },
        update: {
          revision,
          codec: "json-v1",
          data: encodeDocumentJson({ cells: chunk.cells }),
        },
      });
      await tx.formulaCell.update({
        where: {
          sheetId_address: {
            sheetId,
            address: formatA1Cell(result.row, result.col),
          },
        },
        data: { cachedValue: toCachedValue(result) },
      });
    }
    return results;
  } finally {
    engine.destroy();
  }
}
