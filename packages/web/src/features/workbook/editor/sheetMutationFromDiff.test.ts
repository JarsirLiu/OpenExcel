import type { FortuneCell } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { sheetMutationFromDiff } from "./sheetMutationFromDiff";

describe("sheetMutationFromDiff", () => {
  it("returns only changed cells and config", () => {
    const before: FortuneCell[] = [
      { r: 0, c: 0, v: { v: "old", m: "old" } },
      { r: 0, c: 1, v: { v: "keep", m: "keep" } },
    ];
    const after: FortuneCell[] = [
      { r: 0, c: 0, v: { v: "new", m: "new" } },
      { r: 0, c: 1, v: { v: "keep", m: "keep" } },
    ];

    expect(sheetMutationFromDiff(before, after, null, { showGridLines: false })).toEqual({
      type: "patch",
      cells: [{ row: 1, col: 1, cell: { v: "new", m: "new" } }],
      config: { showGridLines: false },
    });
  });

  it("returns null when the sheet is unchanged", () => {
    const cells: FortuneCell[] = [{ r: 0, c: 0, v: { v: "same", m: "same" } }];

    expect(sheetMutationFromDiff(cells, cells, null, null)).toBeNull();
  });

  it("persists a recalculated formula cell together with its cached value", () => {
    const before: FortuneCell[] = [
      { r: 0, c: 0, v: { v: 1, m: "1" } },
      { r: 0, c: 1, v: { v: 3, m: "3" } },
      { r: 0, c: 2, v: { v: 4, m: "4", f: "=SUM(A1:B1)" } },
    ];
    const after: FortuneCell[] = [
      { r: 0, c: 0, v: { v: 2, m: "2" } },
      { r: 0, c: 1, v: { v: 3, m: "3" } },
      { r: 0, c: 2, v: { v: 5, m: "5", f: "=SUM(A1:B1)" } },
    ];

    expect(sheetMutationFromDiff(before, after, null, null)).toEqual({
      type: "patch",
      cells: [
        { row: 1, col: 1, cell: { v: 2, m: "2" } },
        { row: 1, col: 3, cell: { v: 5, m: "5", f: "=SUM(A1:B1)" } },
      ],
    });
  });
});
