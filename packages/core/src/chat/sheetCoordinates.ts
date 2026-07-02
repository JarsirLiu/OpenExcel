import type {
  SheetChangeCell,
  SheetChangeDelta,
  SheetChangeRange,
} from "./sheetChange.js";

export type ZeroBasedSheetChangeCell = {
  row: number;
  col: number;
  value: string;
};

export type ZeroBasedSheetChangeRange = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type ZeroBasedSheetChangeClearOperation =
  | {
      type: "cell";
      row: number;
      col: number;
    }
  | {
      type: "range";
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
    };

export type ZeroBasedSheetChangeDelta =
  | {
      type: "write";
      cells: ZeroBasedSheetChangeCell[];
      merges?: ZeroBasedSheetChangeRange[];
    }
  | {
      type: "clear";
      operations: ZeroBasedSheetChangeClearOperation[];
    }
  | {
      type: "merge";
      operations: ZeroBasedSheetChangeRange[];
    }
  | {
      type: "unmerge";
      operations: ZeroBasedSheetChangeRange[];
    };

export function toZeroBasedIndex(index: number): number {
  return index - 1;
}

export function toOneBasedIndex(index: number): number {
  return index + 1;
}

export function sheetChangeCellToZeroBased(cell: SheetChangeCell): ZeroBasedSheetChangeCell {
  return {
    row: toZeroBasedIndex(cell.row),
    col: toZeroBasedIndex(cell.col),
    value: cell.value,
  };
}

export function sheetChangeRangeToZeroBased(range: SheetChangeRange): ZeroBasedSheetChangeRange {
  return {
    startRow: toZeroBasedIndex(range.startRow),
    startCol: toZeroBasedIndex(range.startCol),
    endRow: toZeroBasedIndex(range.endRow),
    endCol: toZeroBasedIndex(range.endCol),
  };
}

export function sheetChangeDeltaToZeroBased(delta: SheetChangeDelta): ZeroBasedSheetChangeDelta {
  if (delta.type === "write") {
    return {
      type: "write",
      cells: delta.cells.map(sheetChangeCellToZeroBased),
      merges: delta.merges?.map(sheetChangeRangeToZeroBased),
    };
  }

  if (delta.type === "clear") {
    return {
      type: "clear",
      operations: delta.operations.map((operation) =>
        operation.type === "cell"
          ? {
              type: "cell",
              row: toZeroBasedIndex(operation.row),
              col: toZeroBasedIndex(operation.col),
            }
          : {
              type: "range",
              ...sheetChangeRangeToZeroBased(operation),
            },
      ),
    };
  }

  if (delta.type === "merge" || delta.type === "unmerge") {
    return {
      type: delta.type,
      operations: delta.operations.map((operation) => ({
        type: "range",
        ...sheetChangeRangeToZeroBased(operation),
      })),
    };
  }

  throw new Error("Unsupported sheet change delta");
}

export function zeroBasedSheetChangeCellToSheetChangeCell(cell: ZeroBasedSheetChangeCell): SheetChangeCell {
  return {
    row: toOneBasedIndex(cell.row),
    col: toOneBasedIndex(cell.col),
    value: cell.value,
  };
}

export function zeroBasedSheetChangeRangeToSheetChangeRange(range: ZeroBasedSheetChangeRange): SheetChangeRange {
  return {
    startRow: toOneBasedIndex(range.startRow),
    startCol: toOneBasedIndex(range.startCol),
    endRow: toOneBasedIndex(range.endRow),
    endCol: toOneBasedIndex(range.endCol),
  };
}

export function zeroBasedSheetChangeDeltaToSheetChangeDelta(delta: ZeroBasedSheetChangeDelta): SheetChangeDelta {
  if (delta.type === "write") {
    return {
      type: "write",
      cells: delta.cells.map(zeroBasedSheetChangeCellToSheetChangeCell),
      merges: delta.merges?.map(zeroBasedSheetChangeRangeToSheetChangeRange),
    };
  }

  if (delta.type === "clear") {
    return {
      type: "clear",
      operations: delta.operations.map((operation) =>
        operation.type === "cell"
          ? {
              type: "cell",
              row: toOneBasedIndex(operation.row),
              col: toOneBasedIndex(operation.col),
            }
          : {
              type: "range",
              ...zeroBasedSheetChangeRangeToSheetChangeRange(operation),
            },
      ),
    };
  }

  if (delta.type === "merge" || delta.type === "unmerge") {
    return {
      type: delta.type,
      operations: delta.operations.map((operation) => ({
        type: "range",
        ...zeroBasedSheetChangeRangeToSheetChangeRange(operation),
      })),
    };
  }

  throw new Error("Unsupported zero-based sheet change delta");
}
