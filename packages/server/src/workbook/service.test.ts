import { describe, expect, it } from "vitest";
import { WorkbookUploadError, resolveWorkbookImportTargets } from "./service.js";

describe("resolveWorkbookImportTargets", () => {
  it("matches sheets by exact name and preserves workbook order", () => {
    const result = resolveWorkbookImportTargets(["A", "B", "C"], ["C", "A", "B"]);

    expect(result.matchedSheetNames).toEqual(["A", "B", "C"]);
    expect(result.skippedCurrentSheetNames).toEqual([]);
    expect(result.ignoredUploadedSheetNames).toEqual([]);
  });

  it("reports missing and extra sheets without blocking import", () => {
    const result = resolveWorkbookImportTargets(["A", "B"], ["A", "C"]);

    expect(result.matchedSheetNames).toEqual(["A"]);
    expect(result.skippedCurrentSheetNames).toEqual(["B"]);
    expect(result.ignoredUploadedSheetNames).toEqual(["C"]);
  });
});

describe("WorkbookUploadError", () => {
  it("stores code, status and details", () => {
    const err = new WorkbookUploadError("bad file", "INVALID_EXCEL_FILE", 400, { reason: "broken" });

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("INVALID_EXCEL_FILE");
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ reason: "broken" });
  });
});
