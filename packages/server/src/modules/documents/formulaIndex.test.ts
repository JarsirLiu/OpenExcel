import { describe, expect, it } from "vitest";
import { buildFormulaCellData, collectFormulaIndexUpdate } from "./formulaIndex.js";

describe("collectFormulaIndexUpdate", () => {
  it("indexes formulas and clears replaced formulas", () => {
    const result = collectFormulaIndexUpdate([
      {
        type: "setCell",
        row: 0,
        col: 1,
        value: { value: 2, formula: "=A1*2" },
      },
      {
        type: "setRangeValues",
        range: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 },
        values: [[1, 2]],
      },
    ]);

    expect(result.upserts).toEqual(new Map([["B1", "A1*2"]]));
    expect(result.clearRanges).toEqual([{ startRow: 1, startCol: 0, endRow: 1, endCol: 1 }]);
  });

  it("tracks mixed formula ranges cell by cell", () => {
    const result = collectFormulaIndexUpdate([
      {
        type: "setRangeValues",
        range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
        values: [
          [1, 2],
          [3, 4],
        ],
        formulas: [
          [null, "=A1"],
          ["=B1", null],
        ],
      },
    ]);

    expect(result.upserts).toEqual(
      new Map([
        ["B1", "A1"],
        ["A2", "B1"],
      ]),
    );
    expect(result.clearRanges).toEqual([
      { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      { startRow: 1, startCol: 1, endRow: 1, endCol: 1 },
    ]);
  });
});

describe("buildFormulaCellData", () => {
  it("creates canonical formula rows for imported cells", () => {
    const rows = buildFormulaCellData(9, [
      { r: 0, c: 0, v: { v: 1, m: "1" } },
      { r: 1, c: 1, v: { v: 2, m: "2", f: "=A1*2" } },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sheetId).toBe(9);
    expect(rows[0]?.address).toBe("B2");
    expect(rows[0]?.formula).toBe("A1*2");
    expect(rows[0]?.dependencies).toBeInstanceOf(Uint8Array);
  });
});
