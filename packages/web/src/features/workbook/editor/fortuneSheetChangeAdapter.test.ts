import { describe, expect, it } from "vitest";
import { adaptFortuneSheetChange } from "./fortuneSheetChangeAdapter";
import { createSheetEditorSnapshot } from "./sheetMutationFromDiff";

describe("adaptFortuneSheetChange", () => {
  it("observes edited cells and recalculated formulas without scanning the whole matrix", () => {
    const previous = createSheetEditorSnapshot(
      [
        { r: 0, c: 0, v: { v: 90, m: "90" } },
        { r: 0, c: 1, v: { v: 90, m: "90", f: "=SUM(A1:A1)" } },
        { r: 5000, c: 5000, v: { v: "keep", m: "keep" } },
      ],
      null,
    );

    const result = adaptFortuneSheetChange({
      sheetId: 60,
      data: [
        [
          { v: 9, m: "9" },
          { v: 9, m: "9", f: "=SUM(A1:A1)" },
        ],
      ],
      config: null,
      previous,
      hint: { requiresSnapshot: false, changedCellKeys: new Set(["0,0"]) },
    });

    expect(result.change).toEqual({
      kind: "patch",
      sheetId: 60,
      mutation: {
        type: "patch",
        cells: [
          { row: 1, col: 1, cell: { v: 9, m: "9" } },
          { row: 1, col: 2, cell: { v: 9, m: "9" } },
        ],
      },
    });
    expect(result.snapshot.cellsByKey.has("5000,5000")).toBe(true);
  });

  it("materializes only structural changes as a snapshot", () => {
    const result = adaptFortuneSheetChange({
      sheetId: 60,
      data: [[{ v: "new", m: "new" }]],
      config: { showGridLines: false },
      previous: createSheetEditorSnapshot([], null),
      hint: { requiresSnapshot: true, changedCellKeys: new Set() },
    });

    expect(result.change).toEqual({
      kind: "snapshot",
      sheetId: 60,
      snapshot: {
        celldata: [{ r: 0, c: 0, v: { v: "new", m: "new" } }],
        config: { showGridLines: false },
      },
    });
  });
});
