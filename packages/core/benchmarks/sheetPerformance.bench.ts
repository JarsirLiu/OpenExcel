import { bench, describe } from "vitest";
import type { FortuneCell } from "../src/excel/celldataUtils.js";
import { applySheetMutation } from "../src/sheet-sync/applySheetMutation.js";
import type { SheetSnapshot } from "../src/sheet-sync/sheetSnapshot.js";

const sizes = [100_000, 500_000, 1_000_000];
const benchmarkOptions = { iterations: 3, warmupIterations: 1 };

function makeSnapshot(cellCount: number): SheetSnapshot {
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
  return { celldata, config: null };
}

for (const size of sizes) {
  const snapshot = makeSnapshot(size);

  describe(`Core Sheet mutation (${size.toLocaleString()} cells)`, () => {
    bench(
      "applies a single-cell write and creates the bounded summary",
      () => {
        applySheetMutation(snapshot, {
          type: "write",
          operations: [{ type: "cell", row: 1, col: 1, value: "updated" }],
        });
      },
      benchmarkOptions,
    );

    bench(
      "applies a local 20x10 write and creates the bounded summary",
      () => {
        applySheetMutation(snapshot, {
          type: "write",
          operations: [
            { type: "range", startRow: 1, startCol: 1, endRow: 20, endCol: 10, value: "updated" },
          ],
        });
      },
      benchmarkOptions,
    );
  });
}
