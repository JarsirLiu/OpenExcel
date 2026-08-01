import type { FortuneCell, SheetConfig } from "@openexcel/core";

export const SHEET_CHUNK_ROWS = 256;
export const SHEET_CHUNK_COLUMNS = 256;

export type SheetSnapshotForSave = {
  celldata: FortuneCell[];
  config: SheetConfig | null;
};

export type SheetChunkReplacement = {
  chunkRow: number;
  chunkCol: number;
  payload: string | null;
};

function chunkKey(chunkRow: number, chunkCol: number): string {
  return `${chunkRow},${chunkCol}`;
}

function cellChunk(cell: FortuneCell): { chunkRow: number; chunkCol: number } {
  return {
    chunkRow: Math.floor(cell.r / SHEET_CHUNK_ROWS),
    chunkCol: Math.floor(cell.c / SHEET_CHUNK_COLUMNS),
  };
}

export function serializeSheetChunkSnapshot(celldata: readonly FortuneCell[]): Map<string, string> {
  const cellsByChunk = new Map<string, FortuneCell[]>();
  for (const cell of celldata) {
    const { chunkRow, chunkCol } = cellChunk(cell);
    const key = chunkKey(chunkRow, chunkCol);
    const cells = cellsByChunk.get(key);
    if (cells) cells.push(cell);
    else cellsByChunk.set(key, [cell]);
  }

  return new Map(
    [...cellsByChunk.entries()].map(([key, cells]) => [
      key,
      JSON.stringify({
        celldata: [...cells].sort((left, right) => left.r - right.r || left.c - right.c),
      }),
    ]),
  );
}

export function changedSheetChunks(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): SheetChunkReplacement[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .filter((key) => before.get(key) !== after.get(key))
    .map((key) => {
      const [chunkRow, chunkCol] = key.split(",").map(Number);
      return { chunkRow, chunkCol, payload: after.get(key) ?? null };
    })
    .sort((left, right) => left.chunkRow - right.chunkRow || left.chunkCol - right.chunkCol);
}

export function serializeSheetConfig(config: SheetConfig | null): string {
  return JSON.stringify(config);
}
