import { performance } from "node:perf_hooks";
import type { FortuneCell } from "@openexcel/core";
import { storageIndex } from "@openexcel/core";
import { buildSheetChangePreview } from "../src/modules/sheets/domain/sheetPreview.js";

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

function measure(label: string, operation: () => void): void {
  try {
    operation();
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(`${label}: ERROR ${message}`);
    return;
  }
  const times: number[] = [];
  const rssBefore = process.memoryUsage().rss;
  for (let sample = 0; sample < 3; sample += 1) {
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
  let celldata = makeCelldata(size);
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

  celldata = [];
  if (typeof global.gc === "function") global.gc();
}
