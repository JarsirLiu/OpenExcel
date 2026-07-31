import type { FortuneCell } from "@openexcel/core";
import { storageIndex } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { buildSheetChangePreview } from "./sheetPreview.js";

describe("buildSheetChangePreview", () => {
  it("handles large celldata without spreading it into a function call", () => {
    const celldata: FortuneCell[] = Array.from({ length: 500_000 }, (_, index) => ({
      r: Math.floor(index / 100),
      c: index % 100,
      v: { v: `value-${index}`, m: `value-${index}` },
    }));

    expect(() =>
      buildSheetChangePreview(celldata, "Bench", 1, storageIndex(0), storageIndex(49), {
        startCol: storageIndex(0),
        endCol: storageIndex(31),
      }),
    ).not.toThrow();
  });
});
