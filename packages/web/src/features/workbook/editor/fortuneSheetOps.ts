export type FortuneSheetOp = {
  op: "replace" | "remove" | "add" | "insertRowCol" | "deleteRowCol" | "addSheet" | "deleteSheet";
  id?: string;
  path: Array<string | number>;
  value?: unknown;
};

export type FortuneSheetOpHint = {
  requiresSnapshot: boolean;
  changedCellKeys: Set<string>;
  changedCellFields?: Map<string, Set<string>>;
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
      changedCellFields: new Map<string, Set<string>>(),
    };
    const [root, row, col] = op.path;

    if (root === "calcChain") continue;
    if (root !== "data" || !isCellCoordinate(row) || !isCellCoordinate(col)) {
      hint.requiresSnapshot = true;
    } else {
      const cellKey = `${row},${col}`;
      hint.changedCellKeys.add(cellKey);
      const fieldPath = op.path.slice(3);
      const field =
        fieldPath[0] === "v" && typeof fieldPath[1] === "string"
          ? fieldPath[1]
          : typeof fieldPath[0] === "string" && fieldPath[0] !== "v"
            ? fieldPath[0]
            : null;
      if (field) {
        const changedCellFields = hint.changedCellFields ?? new Map<string, Set<string>>();
        const fields = changedCellFields.get(cellKey) ?? new Set<string>();
        fields.add(field);
        changedCellFields.set(cellKey, fields);
        hint.changedCellFields = changedCellFields;
      }
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
