import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { excelToGrid } from "../mapper/excelToGrid.js";
import { templateToExcel } from "../generator/templateToExcel.js";
import type { Template } from "../types/index.js";

describe("excelToGrid", () => {
  function makeWorkbook(sheets: Record<string, string[][]>): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return wb;
  }

  it("returns data rows (skipping header) for matching sheets", () => {
    const wb = makeWorkbook({
      Sheet1: [
        ["Name", "Age"],
        ["Alice", "30"],
        ["Bob", "25"],
      ],
      Sheet2: [
        ["Product", "Price"],
        ["Widget", "10"],
      ],
    });

    const result = excelToGrid(wb, ["Sheet1", "Sheet2"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
    expect(result[1]).toEqual([["Widget", "10"]]);
  });

  it("returns empty array for missing sheet", () => {
    const wb = makeWorkbook({ Existing: [["H", "V"]] });
    const result = excelToGrid(wb, ["Missing"]);
    expect(result).toEqual([[]]);
  });

  it("accepts a Template object with sheets by name", () => {
    const wb = makeWorkbook({
      Sales: [["Q", "Amount"], ["Q1", "100"]],
    });
    const template: Template = {
      id: "t1",
      name: "Test",
      groups: [],
      sheets: [{ name: "Sales", columns: [{ label: "Q" }, { label: "Amount" }], rows: [] }],
    };

    const result = excelToGrid(wb, template);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([["Q1", "100"]]);
  });
});

describe("templateToExcel", () => {
  it("returns an ArrayBuffer", () => {
    const template: Template = {
      id: "t1",
      name: "TestWB",
      groups: [],
      sheets: [
        {
          name: "Sheet1",
          columns: [{ label: "Name" }, { label: "Score" }],
          rows: [["Alice", "95"], ["Bob", "87"]],
        },
      ],
    };

    const result = templateToExcel(template);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("includes all sheets from the template", () => {
    const template: Template = {
      id: "t2",
      name: "Multi",
      groups: [],
      sheets: [
        { name: "SheetA", columns: [{ label: "X" }], rows: [["a"]] },
        { name: "SheetB", columns: [{ label: "Y" }], rows: [["b"]] },
      ],
    };

    const ab = templateToExcel(template);
    const wb = XLSX.read(ab, { type: "array" });
    expect(wb.SheetNames).toEqual(["SheetA", "SheetB"]);
  });
});