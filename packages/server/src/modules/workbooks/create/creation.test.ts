import { describe, expect, it } from "vitest";
import {
  buildBlankSheetInitialization,
  buildSourceSheetInitialization,
  normalizeSheetName,
  normalizeWorkbookName,
  WorkbookCreationError,
} from "./creation.js";

describe("workbook creation helpers", () => {
  it("normalizes workbook and sheet names", () => {
    expect(normalizeWorkbookName()).toBe("New Workbook");
    expect(normalizeWorkbookName("  Demo  ")).toBe("Demo");
    expect(normalizeSheetName(undefined, 1)).toBe("Sheet1");
    expect(normalizeSheetName("  Data  ", 2)).toBe("Data");
  });

  it("builds a blank sheet payload", () => {
    const payload = buildBlankSheetInitialization();

    expect(payload.columns).toBe(JSON.stringify([{ label: "A" }]));
    expect(payload.merges).toBe(JSON.stringify([]));
    expect(JSON.parse(payload.uploadedData)).toEqual([]);
    expect(payload.config).toBeUndefined();
  });

  it("copies source sheet payload fields", () => {
    const payload = buildSourceSheetInitialization({
      columns: JSON.stringify([{ label: "A", width: 120 }]),
      merges: JSON.stringify([{ row: [0, 1], col: [0, 1] }]),
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "x" } }]),
      config: JSON.stringify({ merge: { A1: { r: 0, c: 0, rs: 1, cs: 1 } } }),
    });

    expect(payload.columns).toContain("width");
    expect(payload.merges).toContain("row");
    expect(payload.uploadedData).toContain("x");
    expect(payload.config).toContain("merge");
  });

  it("stores workbook creation errors with code and status", () => {
    const error = new WorkbookCreationError("source missing", "SOURCE_SHEET_NOT_FOUND", 404);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("SOURCE_SHEET_NOT_FOUND");
    expect(error.statusCode).toBe(404);
  });
});
