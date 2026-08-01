import { SHEET_CHUNK_COLUMNS, SHEET_CHUNK_ROWS } from "@/features/sync/sheetChunkSnapshot";

export type FortuneSheetOp = {
  op: "replace" | "remove" | "add" | "insertRowCol" | "deleteRowCol" | "addSheet" | "deleteSheet";
  id?: string;
  path: Array<string | number>;
  value?: unknown;
};

export type FortuneSheetOpHint = {
  cellKeys: Set<string>;
  requiresSnapshot: boolean;
};

function isCellCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function collectFortuneSheetOpHints(
  ops: readonly FortuneSheetOp[],
  activeSheetId: number,
): Map<number, FortuneSheetOpHint> {
  const hints = new Map<number, FortuneSheetOpHint>();

  for (const op of ops) {
    const sheetId = op.id == null ? activeSheetId : Number(op.id);
    if (!Number.isInteger(sheetId)) continue;

    const hint = hints.get(sheetId) ?? { cellKeys: new Set<string>(), requiresSnapshot: false };
    const [root, row, col] = op.path;

    if (root === "calcChain") continue;
    if (root === "data" && isCellCoordinate(row) && isCellCoordinate(col)) {
      hint.cellKeys.add(`${row},${col}`);
    } else {
      hint.requiresSnapshot = true;
    }

    if (
      op.op === "insertRowCol" ||
      op.op === "deleteRowCol" ||
      op.op === "addSheet" ||
      op.op === "deleteSheet"
    ) {
      hint.requiresSnapshot = true;
    }

    hints.set(sheetId, hint);
  }

  return hints;
}

export function chunkKeyForCell(row: number, col: number): string {
  return `${Math.floor(row / SHEET_CHUNK_ROWS)},${Math.floor(col / SHEET_CHUNK_COLUMNS)}`;
}
