import { type FortuneCell, normalizeColorQuery, type SheetChangeDelta } from "@openexcel/core";

export type FortuneSheetApiCall = {
  name: string;
  args: unknown[];
};

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

const CONTENT_FIELDS = new Set(["v", "m", "f"]);

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function toRange(range: ZeroBasedRange): FortuneRange[] {
  return [{ row: [range.startRow, range.endRow], column: [range.startCol, range.endCol] }];
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

function contentOnly(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([field]) => CONTENT_FIELDS.has(field)));
}

function hasCellContent(cell: FortuneCell | undefined): boolean {
  return Boolean(
    cell && (cell.v.v !== undefined || cell.v.m !== undefined || cell.v.f !== undefined),
  );
}

function appendSetCellCall(
  apiCalls: FortuneSheetApiCall[],
  row: number,
  col: number,
  cell: FortuneCell | undefined,
  sheetId: number,
): void {
  if (!cell || !hasCellContent(cell)) {
    apiCalls.push({ name: "clearCell", args: [row, col, { id: String(sheetId) }] });
    return;
  }
  apiCalls.push({
    name: "setCellValue",
    args: [
      row,
      col,
      contentOnly(cell.v as unknown as Record<string, unknown>),
      null,
      {
        id: String(sheetId),
      },
    ],
  });
}

function appendPatchCalls(
  apiCalls: FortuneSheetApiCall[],
  change: Extract<SheetChangeDelta, { type: "patch" }>["cells"][number],
  sheetId: number,
): void {
  const row = change.row - 1;
  const col = change.col - 1;
  if (change.cell === null) {
    apiCalls.push({ name: "clearCell", args: [row, col, { id: String(sheetId) }] });
    return;
  }

  const content = contentOnly(change.cell);
  const removedContent = (change.removed ?? []).some((field) => CONTENT_FIELDS.has(field));
  if (Object.keys(content).length > 0) {
    apiCalls.push({
      name: "setCellValue",
      args: [row, col, content, null, { id: String(sheetId) }],
    });
  } else if (removedContent) {
    apiCalls.push({ name: "clearCell", args: [row, col, { id: String(sheetId) }] });
  }

  for (const attribute of ["bg", "fc"] as const) {
    const explicitlyRemoved = change.removed?.includes(attribute);
    if (!Object.keys(change.cell).includes(attribute) && !explicitlyRemoved) continue;
    const value = explicitlyRemoved ? null : change.cell[attribute];
    apiCalls.push({
      name: "setCellFormat",
      args: [row, col, attribute, value, { id: String(sheetId) }],
    });
  }
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

export function buildFortuneSheetApiCalls(
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
    for (const change of delta.cells) appendPatchCalls(apiCalls, change, sheetId);
  }

  apiCalls.push({ name: "calculateFormula", args: [] });
  return apiCalls;
}
