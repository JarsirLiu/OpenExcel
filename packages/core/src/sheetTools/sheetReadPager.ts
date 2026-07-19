import type { SheetToolRange } from "./sheetDataProjection.js";

export type SheetReadContinuation = {
  requestedRange: SheetToolRange;
  nextRow: number;
  nextCol: number;
};

export type SheetReadPage = {
  range: SheetToolRange;
  continuation: SheetReadContinuation | null;
};

function columnName(column: number): string {
  let value = column;
  let output = "";
  while (value > 0) {
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

export function sheetToolRangeToA1(range: SheetToolRange): string {
  const start = `${columnName(range.startCol)}${range.startRow}`;
  const end = `${columnName(range.endCol)}${range.endRow}`;
  return start === end ? start : `${start}:${end}`;
}

function cellCount(range: SheetToolRange): number {
  return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
}

function assertRange(range: SheetToolRange): void {
  if (
    !Number.isInteger(range.startRow) ||
    !Number.isInteger(range.startCol) ||
    !Number.isInteger(range.endRow) ||
    !Number.isInteger(range.endCol) ||
    range.startRow < 1 ||
    range.startCol < 1 ||
    range.endRow < range.startRow ||
    range.endCol < range.startCol
  ) {
    throw new Error("Invalid sheet data range");
  }
}

function assertContinuation(continuation: SheetReadContinuation): void {
  assertRange(continuation.requestedRange);
  if (
    !Number.isInteger(continuation.nextRow) ||
    !Number.isInteger(continuation.nextCol) ||
    continuation.nextRow < continuation.requestedRange.startRow ||
    continuation.nextRow > continuation.requestedRange.endRow + 1 ||
    continuation.nextCol < continuation.requestedRange.startCol ||
    continuation.nextCol > continuation.requestedRange.endCol ||
    (continuation.nextRow === continuation.requestedRange.endRow + 1 &&
      continuation.nextCol !== continuation.requestedRange.startCol)
  ) {
    throw new Error("Invalid sheet read continuation");
  }
}

/**
 * Plans a row-major traversal of a rectangular range without losing cells
 * when both dimensions exceed the page budget.
 */
export function planSheetReadPage(
  requestedRange: SheetToolRange,
  maxCells: number,
  continuation?: SheetReadContinuation,
): SheetReadPage {
  assertRange(requestedRange);
  if (!Number.isInteger(maxCells) || maxCells < 1) {
    throw new Error("Invalid sheet data page size");
  }

  const cursor = continuation ?? {
    requestedRange,
    nextRow: requestedRange.startRow,
    nextCol: requestedRange.startCol,
  };
  assertContinuation(cursor);
  if (
    cursor.requestedRange.startRow !== requestedRange.startRow ||
    cursor.requestedRange.startCol !== requestedRange.startCol ||
    cursor.requestedRange.endRow !== requestedRange.endRow ||
    cursor.requestedRange.endCol !== requestedRange.endCol
  ) {
    throw new Error("Sheet read continuation does not match requested range");
  }

  if (cursor.nextRow === requestedRange.endRow + 1) {
    return { range: requestedRange, continuation: null };
  }

  const remainingColumns = requestedRange.endCol - cursor.nextCol + 1;
  if (remainingColumns <= 0) {
    throw new Error("Invalid sheet read continuation position");
  }

  let endRow = cursor.nextRow;
  let endCol = requestedRange.endCol;
  const isWideRange = requestedRange.endCol - requestedRange.startCol + 1 > maxCells;
  if (isWideRange) {
    endCol = Math.min(requestedRange.endCol, cursor.nextCol + maxCells - 1);
  } else {
    const rows = Math.max(1, Math.floor(maxCells / remainingColumns));
    endRow = Math.min(requestedRange.endRow, cursor.nextRow + rows - 1);
  }

  const page = {
    startRow: cursor.nextRow,
    startCol: cursor.nextCol,
    endRow,
    endCol,
  };
  const isLastColumnBlock = endCol === requestedRange.endCol;
  const nextRow = isLastColumnBlock ? endRow + 1 : cursor.nextRow;
  const nextCol = isLastColumnBlock ? requestedRange.startCol : endCol + 1;
  const continuationValue =
    nextRow > requestedRange.endRow
      ? null
      : {
          requestedRange,
          nextRow,
          nextCol,
        };

  if (cellCount(page) > maxCells) {
    throw new Error("Sheet read page exceeds cell budget");
  }
  return { range: page, continuation: continuationValue };
}
