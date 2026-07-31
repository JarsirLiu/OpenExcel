import {
  type FortuneCell,
  normalizeFortuneCellData,
  type SheetMutation,
  type SheetSnapshot,
} from "@openexcel/core";

export const SHEET_CHUNK_ROWS = 256;
export const SHEET_CHUNK_COLUMNS = 256;

export type SheetChunkCoordinate = {
  chunkRow: number;
  chunkCol: number;
};

export type SheetChunkRange = SheetChunkCoordinate & {
  endChunkRow: number;
  endChunkCol: number;
};

export type SheetChunkPayload = {
  celldata: FortuneCell[];
};

function chunkCoordinate(row: number, col: number): SheetChunkCoordinate {
  return {
    chunkRow: Math.floor(row / SHEET_CHUNK_ROWS),
    chunkCol: Math.floor(col / SHEET_CHUNK_COLUMNS),
  };
}

function chunkKey(coordinate: SheetChunkCoordinate): string {
  return `${coordinate.chunkRow},${coordinate.chunkCol}`;
}

export function serializeSheetChunks(celldata: readonly FortuneCell[]): Array<{
  chunkRow: number;
  chunkCol: number;
  payload: string;
}> {
  const chunks = new Map<string, { coordinate: SheetChunkCoordinate; celldata: FortuneCell[] }>();
  for (const cell of celldata) {
    const coordinate = chunkCoordinate(cell.r, cell.c);
    const key = chunkKey(coordinate);
    const chunk = chunks.get(key);
    if (chunk) chunk.celldata.push(cell);
    else chunks.set(key, { coordinate, celldata: [cell] });
  }

  return [...chunks.values()].map(({ coordinate, celldata: cells }) => ({
    ...coordinate,
    payload: JSON.stringify({ celldata: cells }),
  }));
}

export function parseSheetChunkPayload(payload: string): FortuneCell[] {
  const parsed = JSON.parse(payload) as Partial<SheetChunkPayload>;
  if (!Array.isArray(parsed.celldata)) {
    throw new Error("Invalid SheetChunk payload: celldata must be an array");
  }
  return parsed.celldata as FortuneCell[];
}

export function snapshotFromSheetChunks(
  chunks: readonly { payload: string }[],
  config: Record<string, unknown> | null,
  normalize = true,
): SheetSnapshot {
  const celldata = chunks.flatMap((chunk) => parseSheetChunkPayload(chunk.payload));
  return {
    celldata: normalize ? normalizeFortuneCellData(celldata) : celldata,
    config,
  };
}

function addChunkRange(
  ranges: Map<string, SheetChunkRange>,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): void {
  const first = chunkCoordinate(startRow - 1, startCol - 1);
  const last = chunkCoordinate(endRow - 1, endCol - 1);
  const range = {
    chunkRow: first.chunkRow,
    chunkCol: first.chunkCol,
    endChunkRow: last.chunkRow,
    endChunkCol: last.chunkCol,
  };
  ranges.set(
    `${range.chunkRow},${range.chunkCol}:${range.endChunkRow},${range.endChunkCol}`,
    range,
  );
}

function mergePointRanges(points: readonly SheetChunkCoordinate[]): SheetChunkRange[] {
  const byRow = new Map<number, number[]>();
  for (const point of points) {
    const columns = byRow.get(point.chunkRow);
    if (columns) columns.push(point.chunkCol);
    else byRow.set(point.chunkRow, [point.chunkCol]);
  }

  const horizontal = new Map<string, SheetChunkRange>();
  for (const [chunkRow, columns] of byRow) {
    const sorted = [...new Set(columns)].sort((left, right) => left - right);
    let start = sorted[0];
    let previous = start;
    for (const column of sorted.slice(1)) {
      if (column !== previous + 1) {
        const range = { chunkRow, chunkCol: start, endChunkRow: chunkRow, endChunkCol: previous };
        horizontal.set(`${range.chunkRow},${range.chunkCol}:${range.endChunkCol}`, range);
        start = column;
      }
      previous = column;
    }
    if (start !== undefined) {
      const range = { chunkRow, chunkCol: start, endChunkRow: chunkRow, endChunkCol: previous };
      horizontal.set(`${range.chunkRow},${range.chunkCol}:${range.endChunkCol}`, range);
    }
  }

  const active = new Map<string, SheetChunkRange>();
  const vertical: SheetChunkRange[] = [];
  for (const range of horizontal.values()) {
    const key = `${range.chunkCol},${range.endChunkCol}`;
    const previous = active.get(key);
    if (previous && previous.endChunkRow + 1 === range.chunkRow) {
      previous.endChunkRow = range.chunkRow;
    } else {
      const next = { ...range };
      vertical.push(next);
      active.set(key, next);
    }
  }
  return vertical;
}

export function mutationChunkRanges(mutation: SheetMutation): SheetChunkRange[] {
  const ranges = new Map<string, SheetChunkRange>();
  const points: SheetChunkCoordinate[] = [];

  if (mutation.type === "patch") {
    for (const cell of mutation.cells) points.push(chunkCoordinate(cell.row - 1, cell.col - 1));
  } else {
    for (const operation of mutation.operations) {
      if (operation.type === "cell") {
        points.push(chunkCoordinate(operation.row - 1, operation.col - 1));
      } else {
        addChunkRange(
          ranges,
          operation.startRow,
          operation.startCol,
          operation.endRow,
          operation.endCol,
        );
      }
    }
  }

  for (const range of mergePointRanges(points)) {
    ranges.set(
      `${range.chunkRow},${range.chunkCol}:${range.endChunkRow},${range.endChunkCol}`,
      range,
    );
  }

  if (mutation.type === "write") {
    for (const merge of mutation.merges ?? []) {
      addChunkRange(ranges, merge.startRow, merge.startCol, merge.endRow, merge.endCol);
    }
  }

  return [...ranges.values()];
}

export function mutationChunkCoordinates(mutation: SheetMutation): SheetChunkCoordinate[] {
  return mutationChunkRanges(mutation).flatMap((range) => {
    const coordinates: SheetChunkCoordinate[] = [];
    for (let chunkRow = range.chunkRow; chunkRow <= range.endChunkRow; chunkRow += 1) {
      for (let chunkCol = range.chunkCol; chunkCol <= range.endChunkCol; chunkCol += 1) {
        coordinates.push({ chunkRow, chunkCol });
      }
    }
    return coordinates;
  });
}

export function chunkContainsCell(
  coordinate: SheetChunkCoordinate,
  cell: Pick<FortuneCell, "r" | "c">,
): boolean {
  return (
    chunkCoordinate(cell.r, cell.c).chunkRow === coordinate.chunkRow &&
    chunkCoordinate(cell.r, cell.c).chunkCol === coordinate.chunkCol
  );
}
