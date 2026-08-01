export type FortuneSheetOp = {
  op: "replace" | "remove" | "add" | "insertRowCol" | "deleteRowCol" | "addSheet" | "deleteSheet";
  id?: string;
  path: Array<string | number>;
  value?: unknown;
};

export type FortuneSheetOpHint = {
  requiresSnapshot: boolean;
  changedCellKeys: Set<string>;
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

    const hint = hints.get(sheetId) ?? {
      requiresSnapshot: false,
      changedCellKeys: new Set<string>(),
    };
    const [root, row, col] = op.path;

    if (root === "calcChain") continue;
    if (root !== "data" || !isCellCoordinate(row) || !isCellCoordinate(col)) {
      hint.requiresSnapshot = true;
    } else {
      hint.changedCellKeys.add(`${row},${col}`);
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
