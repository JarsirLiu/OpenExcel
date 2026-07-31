import { performance } from "node:perf_hooks";
import {
  applySheetMutation,
  type FortuneCell,
  normalizeFortuneCellData,
  type SheetMutation,
  storageIndex,
} from "@openexcel/core";
import { buildSheetChangePreview } from "../src/modules/sheets/domain/sheetPreview.js";
import {
  parseSheetChunkPayload,
  SHEET_CHUNK_COLUMNS,
  SHEET_CHUNK_ROWS,
  serializeSheetChunks,
  snapshotFromSheetChunks,
} from "../src/shared/utils/sheetChunks.js";

const sizes = [100_000, 500_000, 1_000_000];

function makeCelldata(cellCount: number): FortuneCell[] {
  const celldata: FortuneCell[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const row = Math.floor(index / 100);
    const col = index % 100;
    celldata.push({
      r: row,
      c: col,
      v: { v: `value-${index}`, m: `value-${index}` },
    });
  }
  return celldata;
}

function makeDistributedPatch(celldata: readonly FortuneCell[], ratio: number): SheetMutation {
  const changedCellCount = Math.max(1, Math.floor(celldata.length * ratio));
  const step = celldata.length / changedCellCount;
  const cells = Array.from({ length: changedCellCount }, (_, index) => {
    const source = celldata[Math.min(celldata.length - 1, Math.floor(index * step))];
    return {
      row: source.r + 1,
      col: source.c + 1,
      cell: { v: `updated-${index}`, m: `updated-${index}` },
    };
  });
  return { type: "patch", cells };
}

function mutateLegacyPayload(serializedCelldata: string, mutation: SheetMutation): void {
  const current = { celldata: JSON.parse(serializedCelldata) as FortuneCell[], config: null };
  const applied = applySheetMutation(current, mutation);
  JSON.stringify(applied.snapshot.celldata);
}

function mutateAffectedChunks(
  chunks: readonly { chunkRow: number; chunkCol: number; payload: string }[],
  mutation: SheetMutation,
): void {
  const chunkKeys = new Set(
    mutation.type === "patch"
      ? mutation.cells.map(
          (cell) =>
            `${Math.floor((cell.row - 1) / SHEET_CHUNK_ROWS)},${Math.floor((cell.col - 1) / SHEET_CHUNK_COLUMNS)}`,
        )
      : [],
  );
  const affectedChunks = chunks.filter((chunk) =>
    chunkKeys.has(`${chunk.chunkRow},${chunk.chunkCol}`),
  );
  const current = snapshotFromSheetChunks(affectedChunks, null);
  const applied = applySheetMutation(current, {
    ...mutation,
  });
  serializeSheetChunks(normalizeFortuneCellData(applied.snapshot.celldata));
}

function measure(label: string, operation: () => void, samples = 3): void {
  try {
    operation();
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(`${label}: ERROR ${message}`);
    return;
  }
  const times: number[] = [];
  const rssBefore = process.memoryUsage().rss;
  for (let sample = 0; sample < samples; sample += 1) {
    try {
      const start = performance.now();
      operation();
      times.push(performance.now() - start);
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.log(`${label}: ERROR during sample ${sample + 1}: ${message}`);
      return;
    }
  }
  const rssAfter = process.memoryUsage().rss;
  const mean = times.reduce((total, time) => total + time, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(
    `${label}: mean=${mean.toFixed(2)}ms min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms rssDelta=${((rssAfter - rssBefore) / 1024 / 1024).toFixed(1)}MB`,
  );
}

for (const size of sizes) {
  const celldata = makeCelldata(size);
  const serializedCelldata = JSON.stringify(celldata);
  const chunks = serializeSheetChunks(celldata);
  const targetChunk = chunks.find((chunk) => chunk.chunkRow === 0 && chunk.chunkCol === 0);
  if (!targetChunk) throw new Error(`No target chunk generated for ${size} cells`);

  console.log(`\nServer preview (${size.toLocaleString()} cells)`);

  measure("bounded preview", () => {
    buildSheetChangePreview(celldata, "Bench", 1, storageIndex(0), storageIndex(49), {
      startCol: storageIndex(0),
      endCol: storageIndex(31),
    });
  });

  measure("complete celldata JSON serialization", () => {
    JSON.stringify(celldata);
  });

  console.log(`\nChunked Sheet mutation (${size.toLocaleString()} cells)`);

  console.log(
    `stored chunks=${chunks.length.toLocaleString()} targetChunkCells=${parseSheetChunkPayload(targetChunk.payload).length.toLocaleString()}`,
  );

  for (const ratio of [0.01, 0.1, 0.5, 1]) {
    const mutation = makeDistributedPatch(celldata, ratio);
    const changedCellCount = mutation.type === "patch" ? mutation.cells.length : 0;
    const affectedChunkKeys = new Set(
      mutation.type === "patch"
        ? mutation.cells.map(
            (cell) =>
              `${Math.floor((cell.row - 1) / SHEET_CHUNK_ROWS)},${Math.floor((cell.col - 1) / SHEET_CHUNK_COLUMNS)}`,
          )
        : [],
    );
    console.log(
      `\nDistributed mutation ${(ratio * 100).toFixed(0)}% (${changedCellCount.toLocaleString()} cells, ${affectedChunkKeys.size.toLocaleString()} chunks)`,
    );

    measure(
      "legacy full payload patch",
      () => {
        mutateLegacyPayload(serializedCelldata, mutation);
      },
      1,
    );
    measure(
      "affected chunks patch",
      () => {
        mutateAffectedChunks(chunks, mutation);
      },
      1,
    );
  }

  if (typeof global.gc === "function") global.gc();
}
