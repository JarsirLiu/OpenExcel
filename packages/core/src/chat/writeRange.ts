export type WriteRange = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

function columnNumber(value: string): number {
  let result = 0;
  for (const character of value.toUpperCase()) {
    result = result * 26 + character.charCodeAt(0) - 64;
  }
  return result;
}

function columnName(value: number): string {
  let result = "";
  for (let current = value; current > 0; current = Math.floor((current - 1) / 26)) {
    result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  }
  return result;
}

export function parseWriteRange(input: string): WriteRange {
  const match = input.trim().match(/^\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/);
  if (!match) throw new Error(`Invalid A1 range: ${input}`);
  const startRow = Number(match[2]);
  const startCol = columnNumber(match[1]);
  const endRow = Number(match[4] ?? match[2]);
  const endCol = columnNumber(match[3] ?? match[1]);
  if (
    !Number.isSafeInteger(startRow) ||
    !Number.isSafeInteger(endRow) ||
    startRow < 1 ||
    endRow < 1 ||
    startRow > 1_048_576 ||
    endRow > 1_048_576 ||
    startCol > 16_384 ||
    endCol > 16_384
  ) {
    throw new Error(`Invalid A1 range: ${input}`);
  }
  if (endRow < startRow || endCol < startCol) throw new Error(`Invalid A1 range: ${input}`);
  return { startRow, startCol, endRow, endCol };
}

export function formatWriteRange(range: WriteRange): string {
  const start = `${columnName(range.startCol)}${range.startRow}`;
  const end = `${columnName(range.endCol)}${range.endRow}`;
  return start === end ? start : `${start}:${end}`;
}

export function writeRangeCellCount(range: WriteRange): number {
  return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
}
