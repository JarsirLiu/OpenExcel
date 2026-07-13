import { describe, expect, it } from "vitest";
import { extractFormulaReferences } from "./references.js";

describe("extractFormulaReferences", () => {
  it("extracts local cell and range references", () => {
    expect(extractFormulaReferences("SUM(A1:B3)+C4")).toEqual([
      {
        reference: "A1:B3",
        range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      },
      {
        reference: "C4",
        range: { startRow: 3, startCol: 2, endRow: 3, endCol: 2 },
      },
    ]);
  });

  it("preserves qualified sheet references and removes duplicates", () => {
    expect(extractFormulaReferences("='Sales Data'!$A$1+'Sales Data'!A1+Rates!B2")).toEqual([
      {
        sheetName: "Sales Data",
        reference: "A1",
        range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      },
      {
        sheetName: "Rates",
        reference: "B2",
        range: { startRow: 1, startCol: 1, endRow: 1, endCol: 1 },
      },
    ]);
  });

  it("ignores malformed references", () => {
    expect(extractFormulaReferences("SUM(A0)+NotAReference")).toEqual([]);
  });
});
