import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { excelToGrid } from "../mapper/excelToGrid.js";
import { templateToExcel } from "../generator/templateToExcel.js";
import { matrixToCelldata, celldataToGrid, isCelldata } from "../mapper/celldataUtils.js";
import { extractSheetConfig, restoreSheetConfig } from "../mapper/sheetConfig.js";
import type { Template } from "../types/index.js";
import type { FortuneSheetData } from "../mapper/sheetConfig.js";

describe("excelToGrid", () => {
  function makeWorkbook(sheets: Record<string, string[][]>): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return wb;
  }

  it("returns celldata for matching sheets with all rows", () => {
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
    // Sheet1: 3 rows x 2 cols = 6 cells, but sheet_to_json produces sparse data
    expect(result[0].celldata).toHaveLength(6);
    expect(result[0].celldata[0]).toEqual({ r: 0, c: 0, v: expect.objectContaining({ v: "Name" }) });
    expect(result[0].celldata[1]).toEqual({ r: 0, c: 1, v: expect.objectContaining({ v: "Age" }) });
    expect(result[0].celldata[2]).toEqual({ r: 1, c: 0, v: expect.objectContaining({ v: "Alice" }) });

    expect(result[1].celldata).toHaveLength(4);
    expect(result[1].celldata[0]).toEqual({ r: 0, c: 0, v: expect.objectContaining({ v: "Product" }) });
  });

  it("returns empty celldata for missing sheet", () => {
    const wb = makeWorkbook({ Existing: [["H", "V"]] });
    const result = excelToGrid(wb, ["Missing"]);
    expect(result).toHaveLength(1);
    expect(result[0].celldata).toEqual([]);
    expect(result[0].merges).toEqual([]);
    expect(result[0].config).toEqual({});
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
    // Should contain header row + data row (no skip)
    expect(result[0].celldata).toHaveLength(4);
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

describe("matrixToCelldata", () => {
  it("converts FortuneSheet 2D matrix to sparse celldata", () => {
    const matrix = [
      [{ v: "A1", m: "A1" }, { v: "B1", m: "B1" }],
      [null, { v: "B2", m: "B2" }],
    ];
    const result = matrixToCelldata(matrix);
    expect(result).toEqual([
      { r: 0, c: 0, v: { v: "A1", m: "A1" } },
      { r: 0, c: 1, v: { v: "B1", m: "B1" } },
      { r: 1, c: 1, v: { v: "B2", m: "B2" } },
    ]);
  });

  it("skips null rows", () => {
    const matrix = [[{ v: "A1", m: "A1" }], null as any, [{ v: "C1", m: "C1" }]];
    const result = matrixToCelldata(matrix);
    expect(result).toHaveLength(2);
    expect(result[0].r).toBe(0);
    expect(result[1].r).toBe(2);
  });

  it("returns empty array for empty matrix", () => {
    expect(matrixToCelldata([])).toEqual([]);
  });
});

describe("celldataToGrid", () => {
  it("converts celldata to 2D grid", () => {
    const celldata = [
      { r: 0, c: 0, v: { v: "Name", m: "Name" } },
      { r: 0, c: 1, v: { v: "Age", m: "Age" } },
      { r: 1, c: 0, v: { v: "Alice", m: "Alice" } },
    ];
    const grid = celldataToGrid(celldata, 2);
    expect(grid).toEqual([
      ["Name", "Age"],
      ["Alice", ""],
    ]);
  });

  it("handles empty celldata", () => {
    expect(celldataToGrid([], 3)).toEqual([["", "", ""]]);
  });
});

describe("isCelldata", () => {
  it("returns true for valid celldata", () => {
    expect(isCelldata([{ r: 0, c: 0, v: { v: "x", m: "x" } }])).toBe(true);
  });

  it("returns false for plain arrays", () => {
    expect(isCelldata([["a", "b"]])).toBe(false);
  });

  it("returns false for empty arrays", () => {
    expect(isCelldata([])).toBe(false);
  });
});

describe("extractSheetConfig", () => {
  it("extracts non-null config properties", () => {
    const sheet = {
      zoomRatio: 1.5,
      frozen: { type: "rangeRow", range: { row_focus: 2, column_focus: 0 } },
    };
    const result = extractSheetConfig(sheet);
    expect(result).toEqual({
      zoomRatio: 1.5,
      frozen: { type: "rangeRow", range: { row_focus: 2, column_focus: 0 } },
    });
    expect(result.config).toBeUndefined();
  });

  it("returns empty object for sheet with no config", () => {
    expect(extractSheetConfig({ name: "Sheet1" })).toEqual({});
  });
});

describe("restoreSheetConfig", () => {
  it("restores config properties onto FortuneSheetData", () => {
    const target: FortuneSheetData = {
      id: "1",
      name: "Sheet1",
      celldata: [],
      columnWidths: {},
      merges: [],
    };
    restoreSheetConfig(target, { zoomRatio: 2, filter: { type: "row" } });
    expect(target.zoomRatio).toBe(2);
    expect(target.filter).toEqual({ type: "row" });
  });

  it("skips undefined properties", () => {
    const target: FortuneSheetData = {
      id: "1",
      name: "Sheet1",
      celldata: [],
      columnWidths: {},
      merges: [],
    };
    restoreSheetConfig(target, {});
    expect(target.zoomRatio).toBeUndefined();
  });
});
