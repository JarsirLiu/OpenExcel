import { describe, expect, it } from "vitest";
import { WorkbookUploadError, validateWorkbookSheetAlignment } from "./service.js";

describe("validateWorkbookSheetAlignment", () => {
  it("accepts the same sheet names even if the uploaded order differs", () => {
    expect(() => validateWorkbookSheetAlignment(["A", "B", "C"], ["C", "A", "B"])).not.toThrow();
  });

  it("rejects when the uploaded workbook is missing a sheet", () => {
    expect(() => validateWorkbookSheetAlignment(["A", "B"], ["A"])).toThrow(WorkbookUploadError);

    try {
      validateWorkbookSheetAlignment(["A", "B"], ["A"]);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbookUploadError);
      expect((error as WorkbookUploadError).code).toBe("SHEET_COUNT_MISMATCH");
      expect((error as WorkbookUploadError).details).toEqual({
        expectedSheetNames: ["A", "B"],
        uploadedSheetNames: ["A"],
      });
    }
  });

  it("rejects when sheet names do not match", () => {
    try {
      validateWorkbookSheetAlignment(["A", "B"], ["A", "C"]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbookUploadError);
      expect((error as WorkbookUploadError).code).toBe("SHEET_NAME_MISMATCH");
    }
  });

  it("rejects duplicated sheet names in the uploaded workbook", () => {
    try {
      validateWorkbookSheetAlignment(["A", "B"], ["A", "A"]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbookUploadError);
      expect((error as WorkbookUploadError).code).toBe("DUPLICATE_SHEET_NAMES");
      expect((error as WorkbookUploadError).details).toEqual({
        duplicateSheetNames: ["A"],
      });
    }
  });
});
