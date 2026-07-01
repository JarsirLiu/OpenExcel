import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { excelToGrid, extractCellStyle } from "./excelToGrid.js";
import { templateToExcel } from "../exporter/templateToExcel.js";
import { matrixToCelldata, celldataToGrid, isCelldata } from "./celldataUtils.js";
import { extractSheetConfig, restoreSheetConfig } from "./sheetConfig.js";
import type { Template } from "../types/index.js";
import type { FortuneSheetData } from "./sheetConfig.js";

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

describe("Excel parsing: all rows, merges, config", () => {
  it("includes header row (no skip) and merges info", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["项目", "Q1", "Q2"],
      ["收入", "100", "200"],
      ["支出", "50", "80"],
    ]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }];
    ws["!rows"] = [{ hpt: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, "数据");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const results = excelToGrid(buf, ["数据"]);

    expect(results).toHaveLength(1);
    // All 3 rows parsed (header not skipped)
    expect(results[0].celldata.some((c) => c.r === 0 && c.c === 0 && c.v.v === "项目")).toBe(true);
    expect(results[0].celldata.some((c) => c.r === 1 && c.c === 0 && c.v.v === "收入")).toBe(true);
    expect(results[0].celldata.some((c) => c.r === 2 && c.c === 2 && c.v.v === "80")).toBe(true);

    expect(results[0].merges).toEqual([{ row: [0, 0], col: [0, 2] }]);
    expect(results[0].config.columnlen).toBeDefined();
    expect(results[0].config.rowlen).toBeDefined();
  });

  it("preserves merge info (mc) on the top-left cell", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Title", "", ""], ["A", "B", "C"]]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    XLSX.utils.book_append_sheet(wb, ws, "S1");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const results = excelToGrid(buf, ["S1"]);
    const a1 = results[0].celldata.find((c) => c.r === 0 && c.c === 0);

    expect(a1?.v.mc).toEqual({ r: 0, c: 0, rs: 1, cs: 3 });
  });

  it("matches by sheet name, returns empty for missing sheets", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"]]), "现有表");

    const results = excelToGrid(wb, ["现有表", "不存在的"]);
    expect(results[0].celldata.length).toBeGreaterThan(0);
    expect(results[1].celldata).toEqual([]);
    expect(results[1].merges).toEqual([]);
    expect(results[1].config).toEqual({});
  });
});

describe("cell display value (v.m) uses plain text", () => {
  it("uses cell.w (formatted text) over cell.h (HTML rich text)", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["指标"]]);
    // 模拟富文本：h 含 HTML，w 为纯显示文本
    ws["A1"] = { t: "s", v: "指标", h: '<span style="font-size:12pt">指标</span>', w: "指标" };
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const results = excelToGrid(buf, ["S1"]);
    const a1 = results[0].celldata.find((c) => c.r === 0 && c.c === 0);
    expect(a1?.v.m).toBe("指标");
    expect(a1?.v.m.includes("<span")).toBe(false);
  });
});

describe("border extraction", () => {
  it("extracts border styles and colors from cell styles", () => {
    // 直接测 extractCellStyle 逻辑（SheetJS write→read 会丢 .s.border，
    // 但真实 Excel 上传时边框完整保留）
    const mockCell: XLSX.CellObject = {
      t: "s",
      v: "A1",
      h: "A1",
      s: {
        border: {
          top: { style: "thin", color: { rgb: "FF0000" } },
          bottom: { style: "medium", color: { rgb: "0000FF" } },
          left: { style: "thick", color: { rgb: "00FF00" } },
          right: { style: "dashed", color: { rgb: "FFFF00" } },
        },
      },
    };

    // 通过 excelToGrid 的解析路径：用 XLSX 读一个带样式的文件
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["A1"]]);
    // 设置样式后写入再读取
    ws["A1"].s = mockCell.s;
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    // 直接验证 extractCellStyle 的映射逻辑
    const result = extractCellStyle(mockCell);
    expect(result.bd).toEqual({
      t: { s: 1, c: "#FF0000" },
      b: { s: 2, c: "#0000FF" },
      l: { s: 3, c: "#00FF00" },
      r: { s: 6, c: "#FFFF00" },
    });
  });

  it("skips cells without borders", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["A1"]]);
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const results = excelToGrid(buf, ["S1"]);
    const a1 = results[0].celldata.find((c) => c.r === 0 && c.c === 0);
    expect(a1?.v.bd).toBeUndefined();
  });
});

describe("formatting extraction", () => {
  it("extracts alignment from cell styles", () => {
    const cell = { t: "s", v: "居中", w: "居中", s: { alignment: { horizontal: "center", vertical: "center", wrapText: true } } };
    const r = extractCellStyle(cell);
    expect(r.ht).toBe(1);
    expect(r.vt).toBe(1);
    expect(r.tb).toBe("1");
  });

  it("strips HTML tags from display text", () => {
    const cell = { t: "s", v: "预计执行订单\n（MW）", h: "预计执行订单<br/>（MW）", w: "预计执行订单\n（MW）" };
    const r = extractCellStyle(cell);
    expect(r.m).toBe("预计执行订单\n（MW）");
    expect(r.m.includes("<br")).toBe(false);
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
