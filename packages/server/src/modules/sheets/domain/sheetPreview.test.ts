import type { FortuneCell } from "@openexcel/core";
import { storageIndex } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { buildSheetChangePreview } from "./sheetPreview.js";

describe("buildSheetChangePreview", () => {
  it("shows a formula when its cached value is unavailable", () => {
    const preview = buildSheetChangePreview(
      [{ r: 0, c: 1, v: { v: undefined, m: "", f: "=A1*2" } }],
      "Sheet1",
      1,
      storageIndex(0),
      storageIndex(0),
      { startCol: storageIndex(1), endCol: storageIndex(1) },
    );

    expect(preview.rows).toEqual([{ row: 1, values: ["=A1*2"] }]);
  });

  it("shows the formula even when a cached value is available", () => {
    const preview = buildSheetChangePreview(
      [{ r: 0, c: 1, v: { v: 246, m: "246", f: "=A1*2" } }],
      "Sheet1",
      1,
      storageIndex(0),
      storageIndex(0),
      { startCol: storageIndex(1), endCol: storageIndex(1) },
    );

    expect(preview.rows).toEqual([{ row: 1, values: ["=A1*2"] }]);
  });

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
