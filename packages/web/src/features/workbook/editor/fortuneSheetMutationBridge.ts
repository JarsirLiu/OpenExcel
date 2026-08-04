import {
  applySheetMutation,
  type FortuneCell,
  normalizeColorQuery,
  type SheetChangeDelta,
  type SheetConfig,
} from "@openexcel/core";
import type { SheetSchema } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { sheetMutationFromDiff } from "./sheetMutationFromDiff";

export type FortuneSheetApiCall = {
  name: string;
  args: unknown[];
};

export type FortuneSheetMutationPlan = {
  snapshot: SheetSnapshotForSave;
  patch: Extract<SheetChangeDelta, { type: "patch" }> | null;
  apiCalls: FortuneSheetApiCall[];
};

function toSnapshot(sheet: SheetSchema) {
  return {
    celldata: Array.isArray(sheet.uploadedData) ? (sheet.uploadedData as FortuneCell[]) : [],
    config: (sheet.config as Record<string, unknown> | null) ?? null,
  };
}

type ZeroBasedRange = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

type FortuneRange = {
  row: [number, number];
  column: [number, number];
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function toRange(range: ZeroBasedRange): FortuneRange[] {
  return [
    {
      row: [range.startRow, range.endRow],
      column: [range.startCol, range.endCol],
    },
  ];
}

function toZeroBasedRange(range: {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}): ZeroBasedRange {
  return {
    startRow: range.startRow - 1,
    startCol: range.startCol - 1,
    endRow: range.endRow - 1,
    endCol: range.endCol - 1,
  };
}

function forEachRange(range: ZeroBasedRange, callback: (row: number, col: number) => void): void {
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) callback(row, col);
  }
}

function hasCellContent(cell: FortuneCell | undefined): boolean {
  if (!cell) return false;
  return cell.v.v !== undefined || cell.v.m !== undefined || cell.v.f !== undefined;
}

function appendSetCellCall(
  apiCalls: FortuneSheetApiCall[],
  row: number,
  col: number,
  cell: FortuneCell | undefined,
  sheetId: number,
): void {
  if (!hasCellContent(cell)) {
    apiCalls.push({ name: "clearCell", args: [row, col, { id: String(sheetId) }] });
    return;
  }
  apiCalls.push({
    name: "setCellValue",
    // batchCallApis invokes FortuneSheet core APIs, where setCellValue expects
    // the cell input element before options.
    args: [row, col, cell?.v, null, { id: String(sheetId) }],
  });
}

function appendWriteCalls(
  apiCalls: FortuneSheetApiCall[],
  delta: Extract<SheetChangeDelta, { type: "write" }>,
  afterCells: ReadonlyMap<string, FortuneCell>,
  sheetId: number,
): void {
  const coordinates = new Set<string>();
  for (const operation of delta.operations) {
    if (operation.type === "cell") {
      coordinates.add(cellKey(operation.row - 1, operation.col - 1));
      continue;
    }
    forEachRange(toZeroBasedRange(operation), (row, col) => coordinates.add(cellKey(row, col)));
  }

  for (const key of coordinates) {
    const [row, col] = key.split(",").map(Number);
    appendSetCellCall(apiCalls, row, col, afterCells.get(key), sheetId);
  }
}

function appendClearCalls(
  apiCalls: FortuneSheetApiCall[],
  delta: Extract<SheetChangeDelta, { type: "clear" }>,
  beforeCells: readonly FortuneCell[],
  sheetId: number,
): void {
  const coordinates = new Set<string>();
  for (const cell of beforeCells) {
    for (const operation of delta.operations) {
      const range =
        operation.type === "cell"
          ? {
              startRow: operation.row - 1,
              startCol: operation.col - 1,
              endRow: operation.row - 1,
              endCol: operation.col - 1,
            }
          : toZeroBasedRange(operation);
      if (
        cell.r >= range.startRow &&
        cell.r <= range.endRow &&
        cell.c >= range.startCol &&
        cell.c <= range.endCol
      ) {
        coordinates.add(cellKey(cell.r, cell.c));
        break;
      }
    }
  }

  for (const key of coordinates) {
    const [row, col] = key.split(",").map(Number);
    apiCalls.push({ name: "clearCell", args: [row, col, { id: String(sheetId) }] });
  }
}

function appendMergeCalls(
  apiCalls: FortuneSheetApiCall[],
  ranges: readonly { startRow: number; startCol: number; endRow: number; endCol: number }[],
  sheetId: number,
): void {
  for (const range of ranges) {
    apiCalls.push({
      name: "mergeCells",
      args: [toRange(toZeroBasedRange(range)), "all", { id: String(sheetId) }],
    });
  }
}

function appendUnmergeCalls(
  apiCalls: FortuneSheetApiCall[],
  ranges: readonly { startRow: number; startCol: number; endRow: number; endCol: number }[],
  sheetId: number,
): void {
  for (const range of ranges) {
    apiCalls.push({
      name: "cancelMerge",
      args: [toRange(toZeroBasedRange(range)), { id: String(sheetId) }],
    });
  }
}

function appendFormatCalls(
  apiCalls: FortuneSheetApiCall[],
  delta: Extract<SheetChangeDelta, { type: "format" }>,
  sheetId: number,
): void {
  for (const operation of delta.operations) {
    const range = toZeroBasedRange(operation);
    const attributes = [
      ["bg", operation.fill],
      ["fc", operation.fontColor],
    ] as const;
    for (const [attribute, color] of attributes) {
      if (color === undefined) continue;
      const value = color === null ? null : normalizeColorQuery(color);
      if (color !== null && !value) {
        throw new Error("Format colors must be a supported color name or hexadecimal value");
      }
      forEachRange(range, (row, col) => {
        apiCalls.push({
          name: "setCellFormat",
          args: [row, col, attribute, value, { id: String(sheetId) }],
        });
      });
    }
  }
}

function buildApiCalls(
  delta: SheetChangeDelta,
  before: readonly FortuneCell[],
  after: readonly FortuneCell[],
  sheetId: number,
): FortuneSheetApiCall[] {
  const apiCalls: FortuneSheetApiCall[] = [];
  const afterCells = new Map(after.map((cell) => [cellKey(cell.r, cell.c), cell]));

  if (delta.type === "write") {
    appendWriteCalls(apiCalls, delta, afterCells, sheetId);
    appendMergeCalls(apiCalls, delta.merges ?? [], sheetId);
  } else if (delta.type === "clear") {
    appendClearCalls(apiCalls, delta, before, sheetId);
  } else if (delta.type === "merge") {
    appendMergeCalls(apiCalls, delta.operations, sheetId);
  } else if (delta.type === "unmerge") {
    appendUnmergeCalls(apiCalls, delta.operations, sheetId);
  } else if (delta.type === "format") {
    appendFormatCalls(apiCalls, delta, sheetId);
  } else {
    for (const change of delta.cells) {
      apiCalls.push({
        name: change.cell === null ? "clearCell" : "setCellValue",
        args:
          change.cell === null
            ? [change.row - 1, change.col - 1, { id: String(sheetId) }]
            : [change.row - 1, change.col - 1, change.cell, null, { id: String(sheetId) }],
      });
    }
  }

  apiCalls.push({ name: "calculateFormula", args: [] });
  return apiCalls;
}

export function planFortuneSheetMutation(
  sheet: SheetSchema,
  delta: SheetChangeDelta,
): FortuneSheetMutationPlan {
  const before = toSnapshot(sheet);
  const after = applySheetMutation(before, delta).snapshot;
  const patch = sheetMutationFromDiff(
    before.celldata,
    after.celldata,
    (sheet.config as SheetConfig | null) ?? null,
    after.config as SheetConfig | null,
  );
  return {
    snapshot: {
      celldata: after.celldata,
      config: after.config as SheetConfig | null,
    },
    patch: patch?.type === "patch" ? patch : null,
    apiCalls: buildApiCalls(delta, before.celldata, after.celldata, sheet.id),
  };
}
