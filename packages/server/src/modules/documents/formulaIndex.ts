import {
  type CellRange,
  type DocumentOperation,
  encodeDocumentJson,
  extractFormulaReferences,
  type FortuneCell,
  formatA1Cell,
  parseA1Cell,
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

export function buildFormulaCellData(sheetId: number, celldata: FortuneCell[]) {
  return celldata.flatMap((cell) => {
    const rawFormula = cell.v?.f;
    if (typeof rawFormula !== "string" || rawFormula.trim().length === 0) return [];
    const formula = normalizeFormula(rawFormula);
    return [
      {
        sheetId,
        address: formatA1Cell(cell.r, cell.c),
        formula,
        dependencies: encodeDocumentJson(extractFormulaReferences(formula)),
        ast: null,
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

function rangeContainsAddress(range: CellRange, address: string): boolean {
  try {
    const cell = parseA1Cell(address);
    return (
      cell.row >= range.startRow &&
      cell.row <= range.endRow &&
      cell.col >= range.startCol &&
      cell.col <= range.endCol
    );
  } catch {
    return false;
  }
}

export async function syncFormulaIndex(
  tx: Prisma.TransactionClient,
  sheetId: number,
  operations: DocumentOperation[],
): Promise<void> {
  const update = collectFormulaIndexUpdate(operations);
  if (update.upserts.size === 0 && update.clearRanges.length === 0) return;

  const existing = await tx.formulaCell.findMany({
    where: { sheetId },
    select: { id: true, address: true },
  });
  const idsToDelete = existing
    .filter(
      (row) =>
        update.upserts.has(row.address) ||
        update.clearRanges.some((range) => rangeContainsAddress(range, row.address)),
    )
    .map((row) => row.id);
  if (idsToDelete.length > 0) {
    await tx.formulaCell.deleteMany({ where: { id: { in: idsToDelete } } });
  }

  if (update.upserts.size > 0) {
    await tx.formulaCell.createMany({
      data: [...update.upserts].map(([address, formula]) => ({
        sheetId,
        address,
        formula,
        dependencies: encodeDocumentJson(extractFormulaReferences(formula)),
        ast: null,
        cachedValue: null,
      })),
    });
  }
}
