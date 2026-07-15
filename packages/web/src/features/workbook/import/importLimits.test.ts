import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_BATCH_BYTES,
  MAX_IMPORT_FILE_BYTES,
  validateImportFileSizes,
} from "./importLimits";

function file(size: number, name = "预算.xlsx"): File {
  return new File([new Uint8Array(size)], name);
}

describe("validateImportFileSizes", () => {
  it("accepts files within the per-file and batch limits", () => {
    expect(() =>
      validateImportFileSizes([
        file(MAX_IMPORT_FILE_BYTES),
        file(MAX_IMPORT_BATCH_BYTES - MAX_IMPORT_FILE_BYTES),
      ]),
    ).not.toThrow();
  });

  it("rejects a file over 5 MiB", () => {
    expect(() => validateImportFileSizes([file(MAX_IMPORT_FILE_BYTES + 1)])).toThrow(
      "单个 Excel 文件不能超过 5 MB",
    );
  });

  it("rejects a batch over 10 MiB", () => {
    expect(() =>
      validateImportFileSizes([
        file(MAX_IMPORT_FILE_BYTES, "一.xlsx"),
        file(MAX_IMPORT_FILE_BYTES, "二.xlsx"),
        file(1, "三.xlsx"),
      ]),
    ).toThrow("批量 Excel 文件总大小不能超过 10 MB");
  });
});
