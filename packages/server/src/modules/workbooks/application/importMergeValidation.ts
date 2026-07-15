import { ImportValidationError } from "./importValidationErrors.js";
import type { ImportedWorkbookPayload } from "./importWorkbookSchema.js";
import { WORKBOOK_IMPORT_PAYLOAD_LIMITS } from "./importWorkbookSchema.js";

type MergeRange = ImportedWorkbookPayload["sheets"][number]["merges"][number];

function rangeKey(range: MergeRange): string {
  return `${range.row[0]}:${range.row[1]}:${range.col[0]}:${range.col[1]}`;
}

function rangeFromCell(cell: ImportedWorkbookPayload["sheets"][number]["celldata"][number]) {
  const merge = cell.v.mc;
  if (!merge) return undefined;
  return {
    row: [merge.r, merge.r + (merge.rs ?? 1) - 1] as [number, number],
    col: [merge.c, merge.c + (merge.cs ?? 1) - 1] as [number, number],
  } satisfies MergeRange;
}

function fail(message: string, sheetName: string, details?: Record<string, unknown>): never {
  throw new ImportValidationError(message, "INVALID_IMPORT_PAYLOAD", 400, {
    sheetName,
    ...details,
  });
}

class RangeMaxTree {
  private readonly max: number[];
  private readonly lazy: number[];

  constructor(size: number) {
    const capacity = size * 4;
    this.max = Array.from({ length: capacity }, () => 0);
    this.lazy = Array.from({ length: capacity }, () => 0);
  }

  add(start: number, end: number, value: number): void {
    this.update(1, 0, this.max.length / 4 - 1, start, end, value);
  }

  maximum(start: number, end: number): number {
    return this.query(1, 0, this.max.length / 4 - 1, start, end);
  }

  private update(
    node: number,
    left: number,
    right: number,
    start: number,
    end: number,
    value: number,
  ): void {
    if (start > right || end < left) return;
    if (start <= left && right <= end) {
      this.max[node] += value;
      this.lazy[node] += value;
      return;
    }
    const middle = (left + right) >> 1;
    this.update(node * 2, left, middle, start, end, value);
    this.update(node * 2 + 1, middle + 1, right, start, end, value);
    this.max[node] = this.lazy[node] + Math.max(this.max[node * 2], this.max[node * 2 + 1]);
  }

  private query(node: number, left: number, right: number, start: number, end: number): number {
    if (start > right || end < left) return 0;
    if (start <= left && right <= end) return this.max[node];
    const middle = (left + right) >> 1;
    return (
      this.lazy[node] +
      Math.max(
        this.query(node * 2, left, middle, start, end),
        this.query(node * 2 + 1, middle + 1, right, start, end),
      )
    );
  }
}

function assertNoOverlappingRanges(ranges: readonly MergeRange[], sheetName: string): void {
  if (ranges.length < 2) return;

  const coordinates = [
    ...new Set(ranges.flatMap((range) => [range.col[0], range.col[1] + 1])),
  ].sort((left, right) => left - right);
  const coordinateIndex = new Map(coordinates.map((value, index) => [value, index]));
  const events = ranges.flatMap((range) => [
    {
      row: range.row[0],
      type: 1,
      start: coordinateIndex.get(range.col[0]) as number,
      end: (coordinateIndex.get(range.col[1] + 1) as number) - 1,
    },
    {
      row: range.row[1] + 1,
      type: -1,
      start: coordinateIndex.get(range.col[0]) as number,
      end: (coordinateIndex.get(range.col[1] + 1) as number) - 1,
    },
  ]);
  events.sort((left, right) => left.row - right.row || left.type - right.type);

  const tree = new RangeMaxTree(coordinates.length);
  for (const event of events) {
    if (event.type === 1 && tree.maximum(event.start, event.end) > 0) {
      fail("导入数据包含重叠的合并区域", sheetName);
    }
    tree.add(event.start, event.end, event.type);
  }
}

function collectRanges(
  ranges: readonly MergeRange[],
  sheetName: string,
  source: "merges" | "cells",
): Map<string, MergeRange> {
  const result = new Map<string, MergeRange>();
  for (const range of ranges) {
    if (range.row[1] < range.row[0] || range.col[1] < range.col[0]) {
      fail("导入数据包含无效的合并区域", sheetName, { source });
    }
    const key = rangeKey(range);
    if (result.has(key)) {
      if (source === "cells") continue;
      fail("导入数据包含重复的合并区域", sheetName, { source });
    }
    result.set(key, range);
  }
  return result;
}

export function validateAndNormalizeMerges(
  sheet: ImportedWorkbookPayload["sheets"][number],
): MergeRange[] {
  const explicitRanges = collectRanges(sheet.merges, sheet.name, "merges");
  if (explicitRanges.size > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxMergesPerSheet) {
    throw new ImportValidationError("工作表合并区域数量超过限制", "IMPORT_LIMIT_EXCEEDED", 413, {
      sheetName: sheet.name,
      maxMerges: WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxMergesPerSheet,
    });
  }

  const cellRanges: MergeRange[] = [];
  const placeholderCells: {
    row: number;
    column: number;
    anchorRow: number;
    anchorColumn: number;
  }[] = [];
  for (const cell of sheet.celldata) {
    const merge = cell.v.mc;
    if (!merge) continue;
    const range = rangeFromCell(cell);
    if (merge.r === cell.r && merge.c === cell.c) {
      cellRanges.push(range as MergeRange);
    } else if (merge.rs == null && merge.cs == null) {
      placeholderCells.push({
        row: cell.r,
        column: cell.c,
        anchorRow: merge.r,
        anchorColumn: merge.c,
      });
    } else {
      cellRanges.push(range as MergeRange);
    }
  }

  const cellRangeMap = collectRanges(cellRanges, sheet.name, "cells");
  if (placeholderCells.length > 0 && cellRangeMap.size === 0) {
    fail("合并占位单元格缺少合并锚点", sheet.name);
  }

  if (cellRangeMap.size > 0 && explicitRanges.size > 0) {
    const explicitKeys = [...explicitRanges.keys()].sort();
    const cellKeys = [...cellRangeMap.keys()].sort();
    if (
      explicitKeys.length !== cellKeys.length ||
      explicitKeys.some((key, index) => key !== cellKeys[index])
    ) {
      fail("单元格合并信息与合并区域列表不一致", sheet.name);
    }
  }

  const normalized = [...(cellRangeMap.size > 0 ? cellRangeMap.values() : explicitRanges.values())];
  if (normalized.length > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxMergesPerSheet) {
    throw new ImportValidationError("工作表合并区域数量超过限制", "IMPORT_LIMIT_EXCEEDED", 413, {
      sheetName: sheet.name,
      maxMerges: WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxMergesPerSheet,
    });
  }

  const rangesByAnchor = new Map(
    normalized.map((range) => [`${range.row[0]}:${range.col[0]}`, range]),
  );
  for (const placeholder of placeholderCells) {
    const range = rangesByAnchor.get(`${placeholder.anchorRow}:${placeholder.anchorColumn}`);
    if (
      !range ||
      placeholder.row < range.row[0] ||
      placeholder.row > range.row[1] ||
      placeholder.column < range.col[0] ||
      placeholder.column > range.col[1]
    ) {
      fail("合并占位单元格超出合并区域", sheet.name, placeholder);
    }
  }

  assertNoOverlappingRanges(normalized, sheet.name);
  return normalized;
}
