import type {
  SheetChangeCell,
  SheetChangeDelta,
  SheetChangeRange,
  SheetChangeWriteOperation,
} from "./sheetChange.js";

/**
 * Coordinate contract: only the Core coordinate and geometry modules may apply
 * the +1 / -1 conversion.
 *
 * - FortuneSheet and database JSON are 0-based (`r=0,c=0` is A1).
 * - Excel import and export structures are 0-based.
 * - AI tool inputs and outputs are 1-based Excel coordinates.
 * - Tool preview data is 1-based.
 *
 * Business modules must use these conversion functions or sheetGeometry.
 */

declare const storageIndexBrand: unique symbol;
declare const toolIndexBrand: unique symbol;

/** 0-based index used by FortuneSheet and persisted sheet data. */
export type StorageIndex = number & { readonly [storageIndexBrand]: "StorageIndex" };
/** 1-based index used by AI tools and Excel-facing data. */
export type ToolIndex = number & { readonly [toolIndexBrand]: "ToolIndex" };

/** 0-based persisted coordinate range. */
export type StorageRange = {
  startRow: StorageIndex;
  startCol: StorageIndex;
  endRow: StorageIndex;
  endCol: StorageIndex;
};
/** 1-based tool coordinate range. */
export type ToolRange = {
  startRow: ToolIndex;
  startCol: ToolIndex;
  endRow: ToolIndex;
  endCol: ToolIndex;
};

function requireInteger(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

export function storageIndex(value: number): StorageIndex {
  const index = requireInteger(value, "Storage index");
  if (index < 0) throw new Error("Storage index must be non-negative");
  return index as StorageIndex;
}

export function toolIndex(value: number): ToolIndex {
  const index = requireInteger(value, "Tool index");
  if (index < 1) throw new Error("Tool index must be positive");
  return index as ToolIndex;
}

export type ZeroBasedSheetChangeCell = {
  row: StorageIndex;
  col: StorageIndex;
  value: string | number | boolean;
  values?: never;
  valueType?: "date" | "string";
  formula?: string;
};

export type ZeroBasedSheetChangeWriteOperation =
  | ({ type: "cell" } & ZeroBasedSheetChangeCell)
  | {
      type: "range";
      startRow: StorageIndex;
      startCol: StorageIndex;
      endRow: StorageIndex;
      endCol: StorageIndex;
      value?: string | number | boolean;
      values?: Array<Array<string | number | boolean>>;
      valueType?: "date" | "string";
      formula?: string;
    };

export type ZeroBasedSheetChangeRange = {
  startRow: StorageIndex;
  startCol: StorageIndex;
  endRow: StorageIndex;
  endCol: StorageIndex;
};

export type ZeroBasedSheetWriteDelta = {
  type: "write";
  operations: ZeroBasedSheetChangeWriteOperation[];
  merges?: ZeroBasedSheetChangeRange[];
};

export type ZeroBasedSheetChangeClearOperation =
  | {
      type: "cell";
      row: StorageIndex;
      col: StorageIndex;
    }
  | {
      type: "range";
      startRow: StorageIndex;
      startCol: StorageIndex;
      endRow: StorageIndex;
      endCol: StorageIndex;
    };

export type ZeroBasedSheetChangeDelta =
  | ZeroBasedSheetWriteDelta
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

/**
 * Convert a 1-based tool index to a 0-based storage index.
 * For example, tool row=1 (A1) becomes storage r=0.
 */
export function toolIndexToStorage(index: ToolIndex): StorageIndex {
  return storageIndex(index - 1);
}

/**
 * Convert a 0-based storage index to a 1-based tool index.
 * For example, celldata r=2 becomes row=3.
 */
export function storageIndexToTool(index: StorageIndex): ToolIndex {
  return toolIndex(index + 1);
}

/** Convert a 1-based tool range to a 0-based storage range. */
export function toolRangeToStorage(range: ToolRange): StorageRange {
  return {
    startRow: toolIndexToStorage(range.startRow),
    startCol: toolIndexToStorage(range.startCol),
    endRow: toolIndexToStorage(range.endRow),
    endCol: toolIndexToStorage(range.endCol),
  };
}

/** Convert a 0-based storage range to a 1-based tool range. */
export function storageRangeToTool(range: StorageRange): ToolRange {
  return {
    startRow: storageIndexToTool(range.startRow),
    startCol: storageIndexToTool(range.startCol),
    endRow: storageIndexToTool(range.endRow),
    endCol: storageIndexToTool(range.endCol),
  };
}

export function sheetChangeCellToZeroBased(cell: SheetChangeCell): ZeroBasedSheetChangeCell {
  return {
    row: toolIndexToStorage(toolIndex(cell.row)),
    col: toolIndexToStorage(toolIndex(cell.col)),
    value: cell.value,
    valueType: cell.valueType,
    formula: cell.formula,
  };
}

function sheetChangeWriteOperationToZeroBased(
  operation: SheetChangeWriteOperation,
): ZeroBasedSheetChangeWriteOperation {
  if (operation.type === "cell") {
    return {
      type: "cell",
      ...sheetChangeCellToZeroBased(operation),
    };
  }
  return {
    type: "range",
    startRow: toolIndexToStorage(toolIndex(operation.startRow)),
    startCol: toolIndexToStorage(toolIndex(operation.startCol)),
    endRow: toolIndexToStorage(toolIndex(operation.endRow)),
    endCol: toolIndexToStorage(toolIndex(operation.endCol)),
    value: operation.value,
    values: operation.values,
    valueType: operation.valueType,
    formula: operation.formula,
  };
}

export function sheetChangeRangeToZeroBased(range: SheetChangeRange): ZeroBasedSheetChangeRange {
  return {
    startRow: toolIndexToStorage(toolIndex(range.startRow)),
    startCol: toolIndexToStorage(toolIndex(range.startCol)),
    endRow: toolIndexToStorage(toolIndex(range.endRow)),
    endCol: toolIndexToStorage(toolIndex(range.endCol)),
  };
}

export function sheetChangeDeltaToZeroBased(delta: SheetChangeDelta): ZeroBasedSheetChangeDelta {
  if (delta.type === "write") {
    return {
      type: "write",
      operations: delta.operations.map(sheetChangeWriteOperationToZeroBased),
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
              row: toolIndexToStorage(toolIndex(operation.row)),
              col: toolIndexToStorage(toolIndex(operation.col)),
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

export function zeroBasedSheetChangeCellToSheetChangeCell(
  cell: ZeroBasedSheetChangeCell,
): SheetChangeCell {
  return {
    row: storageIndexToTool(cell.row),
    col: storageIndexToTool(cell.col),
    value: cell.value,
    valueType: cell.valueType,
    formula: cell.formula,
  };
}

function zeroBasedWriteOperationToSheetChangeOperation(
  operation: ZeroBasedSheetChangeWriteOperation,
): SheetChangeWriteOperation {
  if (operation.type === "cell") {
    return {
      type: "cell",
      row: storageIndexToTool(operation.row),
      col: storageIndexToTool(operation.col),
      value: operation.value,
      valueType: operation.valueType,
      formula: operation.formula,
    };
  }
  return {
    type: "range",
    startRow: storageIndexToTool(operation.startRow),
    startCol: storageIndexToTool(operation.startCol),
    endRow: storageIndexToTool(operation.endRow),
    endCol: storageIndexToTool(operation.endCol),
    value: operation.value,
    values: operation.values,
    valueType: operation.valueType,
    formula: operation.formula,
  };
}

export function zeroBasedSheetChangeRangeToSheetChangeRange(
  range: ZeroBasedSheetChangeRange,
): SheetChangeRange {
  return {
    startRow: storageIndexToTool(range.startRow),
    startCol: storageIndexToTool(range.startCol),
    endRow: storageIndexToTool(range.endRow),
    endCol: storageIndexToTool(range.endCol),
  };
}

export function zeroBasedSheetChangeDeltaToSheetChangeDelta(
  delta: ZeroBasedSheetChangeDelta,
): SheetChangeDelta {
  if (delta.type === "write") {
    return {
      type: "write",
      operations: delta.operations.map(zeroBasedWriteOperationToSheetChangeOperation),
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
              row: storageIndexToTool(operation.row),
              col: storageIndexToTool(operation.col),
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
