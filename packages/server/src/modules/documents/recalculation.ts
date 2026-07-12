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

function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return !(
    left.endRow < right.startRow ||
    left.startRow > right.endRow ||
    left.endCol < right.startCol ||
    left.startCol > right.endCol
  );
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

  const [sheets, formulaRows] = await Promise.all([
    tx.sheet.findMany({ where: { workbookId }, select: { id: true, name: true } }),
    tx.formulaCell.findMany({
      where: { sheet: { workbookId } },
      select: { sheetId: true, address: true, formula: true, dependencies: true },
    }),
  ]);
  if (formulaRows.length === 0) return [];

  const sheetIdsByName = new Map(sheets.map((sheet) => [sheet.name, sheet.id]));
  const formulas: StoredFormula[] = formulaRows.map((row) => ({
    sheetId: row.sheetId,
    address: row.address,
    formula: row.formula,
    dependencies: decodeDependencies(row.dependencies),
  }));
  const affected = new Map<string, StoredFormula>();
  const pending = [...changedRanges];

  for (let index = 0; index < pending.length; index += 1) {
    const change = pending[index];
    if (!change) continue;

    for (const formula of formulas) {
      const formulaKey = `${formula.sheetId}:${formula.address}`;
      if (affected.has(formulaKey)) continue;

      const ownRange = formulaCellRange(formula);
      const changedFormulaCell =
        ownRange && rangesIntersect(ownRange, change.range) && change.sheetId === formula.sheetId;
      const dependencyChanged = formula.dependencies.some((dependency) => {
        const dependencySheetId = dependency.sheetName
          ? sheetIdsByName.get(dependency.sheetName)
          : formula.sheetId;
        return (
          dependencySheetId === change.sheetId && rangesIntersect(dependency.range, change.range)
        );
      });

      if (!changedFormulaCell && !dependencyChanged) continue;
      affected.set(formulaKey, formula);
      if (ownRange) pending.push({ sheetId: formula.sheetId, range: ownRange });
    }
  }

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
