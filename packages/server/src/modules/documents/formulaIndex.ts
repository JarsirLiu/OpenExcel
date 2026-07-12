import {
  type CellRange,
  type DocumentOperation,
  encodeDocumentJson,
  extractFormulaReferences,
  type FortuneCell,
  formatA1Cell,
  parseA1Cell,
  parseFormula,
} from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";

export interface FormulaIndexUpdate {
  upserts: Map<string, string>;
  clearRanges: CellRange[];
}

function normalizeFormula(formula: string): string {
  const normalized = formula.trim();
  return normalized.startsWith("=") ? normalized.slice(1) : normalized;
}

function encodeFormulaAst(formula: string): Uint8Array<ArrayBuffer> | null {
  try {
    return encodeDocumentJson(parseFormula(formula));
  } catch {
    return null;
  }
}

export function buildFormulaCellData(sheetId: number, celldata: FortuneCell[]) {
  return celldata.flatMap((cell) => {
    const rawFormula = cell.v?.f;
    if (typeof rawFormula !== "string" || rawFormula.trim().length === 0) return [];
    const formula = normalizeFormula(rawFormula);
    return [
      {
        sheetId,
        row: cell.r,
        col: cell.c,
        address: formatA1Cell(cell.r, cell.c),
        formula,
        dependencies: encodeDocumentJson(extractFormulaReferences(formula)),
        ast: encodeFormulaAst(formula),
        cachedValue: null,
      },
    ];
  });
}

export function collectFormulaIndexUpdate(operations: DocumentOperation[]): FormulaIndexUpdate {
  const update: FormulaIndexUpdate = { upserts: new Map(), clearRanges: [] };

  for (const operation of operations) {
    switch (operation.type) {
      case "setCell": {
        const address = formatA1Cell(operation.row, operation.col);
        const formula = operation.value?.formula?.trim();
        if (formula) {
          update.upserts.set(address, normalizeFormula(formula));
        } else {
          update.clearRanges.push({
            startRow: operation.row,
            startCol: operation.col,
            endRow: operation.row,
            endCol: operation.col,
          });
        }
        break;
      }
      case "setRangeValues": {
        const rows = operation.range.endRow - operation.range.startRow + 1;
        const cols = operation.range.endCol - operation.range.startCol + 1;
        if (!operation.formulas) {
          update.clearRanges.push(operation.range);
          break;
        }
        for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
          for (let colOffset = 0; colOffset < cols; colOffset += 1) {
            const row = operation.range.startRow + rowOffset;
            const col = operation.range.startCol + colOffset;
            const formula = operation.formulas[rowOffset]?.[colOffset]?.trim();
            const address = formatA1Cell(row, col);
            if (formula) {
              update.upserts.set(address, normalizeFormula(formula));
            } else {
              update.clearRanges.push({ startRow: row, startCol: col, endRow: row, endCol: col });
            }
          }
        }
        break;
      }
      case "clearRange":
        update.clearRanges.push(operation.range);
        break;
      default:
        break;
    }
  }

  return update;
}

export async function syncFormulaIndex(
  tx: Prisma.TransactionClient,
  workbookId: number,
  sheetId: number,
  operations: DocumentOperation[],
): Promise<void> {
  const update = collectFormulaIndexUpdate(operations);
  if (update.upserts.size === 0 && update.clearRanges.length === 0) return;

  const [sheets, existing] = await Promise.all([
    tx.sheet.findMany({ where: { workbookId }, select: { id: true, name: true } }),
    update.clearRanges.length === 0
      ? Promise.resolve([])
      : tx.formulaCell.findMany({
          where: {
            OR: update.clearRanges.map((range) => ({
              sheetId,
              row: { gte: range.startRow, lte: range.endRow },
              col: { gte: range.startCol, lte: range.endCol },
            })),
          },
          select: { row: true, col: true, address: true },
        }),
  ]);
  const addressesToClear = new Set(
    existing
      .filter((row) =>
        update.clearRanges.some(
          (range) =>
            row.row >= range.startRow &&
            row.row <= range.endRow &&
            row.col >= range.startCol &&
            row.col <= range.endCol,
        ),
      )
      .map((row) => row.address),
  );
  const upserts = [...update.upserts].filter(([address]) => !addressesToClear.has(address));
  const addresses = new Set([...addressesToClear, ...upserts.map(([address]) => address)]);
  if (addresses.size === 0) return;

  await tx.formulaDependency.deleteMany({
    where: { targetSheetId: sheetId, targetAddress: { in: [...addresses] } },
  });
  await tx.formulaCell.deleteMany({
    where: { sheetId, address: { in: [...addresses] } },
  });

  if (upserts.length === 0) return;

  const sheetIdsByName = new Map(sheets.map((sheet) => [sheet.name, sheet.id]));
  const formulaRows = upserts.map(([address, formula]) => {
    const cell = parseA1Cell(address);
    return {
      sheetId,
      row: cell.row,
      col: cell.col,
      address,
      formula,
      dependencies: encodeDocumentJson(extractFormulaReferences(formula)),
      ast: encodeFormulaAst(formula),
      cachedValue: null,
    };
  });
  await tx.formulaCell.createMany({ data: formulaRows });

  const dependencyRows = formulaRows.flatMap((row) =>
    extractFormulaReferences(row.formula).flatMap((dependency) => {
      const sourceSheetId = dependency.sheetName
        ? sheetIdsByName.get(dependency.sheetName)
        : sheetId;
      if (sourceSheetId === undefined) return [];
      return [
        {
          sourceSheetId,
          targetSheetId: sheetId,
          targetAddress: row.address,
          startRow: dependency.range.startRow,
          startCol: dependency.range.startCol,
          endRow: dependency.range.endRow,
          endCol: dependency.range.endCol,
        },
      ];
    }),
  );
  if (dependencyRows.length > 0) {
    await tx.formulaDependency.createMany({ data: dependencyRows });
  }
}
