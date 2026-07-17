import type { SheetChangeCell, SheetChangeDelta, SheetChangeRange } from "./sheetChange.js";

/**
 * 坐标层级契约（只允许在 core 的坐标/几何模块出现 +1 / -1）：
 *
 * - FortuneSheet / 数据库 JSON：0-based，`r=0,c=0` 对应 A1
 * - Excel 导入导出内部结构：0-based
 * - AI 工具参数和返回值：1-based（Excel 视觉行号/列号）
 * - 工具预览数据：1-based
 *
 * 业务模块禁止自行进行坐标换算，必须通过这里的转换函数或 sheetGeometry 模块。
 */

declare const storageIndexBrand: unique symbol;
declare const toolIndexBrand: unique symbol;

/** FortuneSheet / 数据库存储用的 0-based 索引 */
export type StorageIndex = number & { readonly [storageIndexBrand]: "StorageIndex" };
/** AI 工具 / Excel 视觉 1-based 索引 */
export type ToolIndex = number & { readonly [toolIndexBrand]: "ToolIndex" };

/** 0-based 存储坐标范围 */
export type StorageRange = {
  startRow: StorageIndex;
  startCol: StorageIndex;
  endRow: StorageIndex;
  endCol: StorageIndex;
};
/** 1-based 工具坐标范围 */
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
  formula?: string;
};

export type ZeroBasedSheetChangeRange = {
  startRow: StorageIndex;
  startCol: StorageIndex;
  endRow: StorageIndex;
  endCol: StorageIndex;
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

/**
 * 工具 1-based 索引 → 存储 0-based 索引。
 * 例如模型传入 row=1（A1）→ 存储 r=0。
 */
export function toolIndexToStorage(index: ToolIndex): StorageIndex {
  return storageIndex(index - 1);
}

/**
 * 存储 0-based 索引 → 工具 1-based 索引。
 * 例如读取 celldata r=2 → 返回 row=3。
 */
export function storageIndexToTool(index: StorageIndex): ToolIndex {
  return toolIndex(index + 1);
}

/**
 * 工具 1-based 范围 → 存储 0-based 范围。
 */
export function toolRangeToStorage(range: ToolRange): StorageRange {
  return {
    startRow: toolIndexToStorage(range.startRow),
    startCol: toolIndexToStorage(range.startCol),
    endRow: toolIndexToStorage(range.endRow),
    endCol: toolIndexToStorage(range.endCol),
  };
}

/**
 * 存储 0-based 范围 → 工具 1-based 范围。
 */
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
    formula: cell.formula,
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
    formula: cell.formula,
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
