import { describe, expect, it, vi } from "vitest";
import { transformFileToFortuneSheets } from "./workbookFileAdapter";

const fortuneExcelMock = vi.hoisted(() => ({
  transformXlsxFileToFortuneSheets: vi.fn(async () => [{ name: "xlsx" }]),
}));
const sheetJsMock = vi.hoisted(() => ({
  transformSheetJsFileToFortuneSheets: vi.fn(async () => [{ name: "sheetjs" }]),
}));

vi.mock("./fortuneExcelAdapter", () => fortuneExcelMock);
vi.mock("./sheetJsAdapter", () => sheetJsMock);

describe("workbookFileAdapter", () => {
  it("routes XLSX files to FortuneExcel", async () => {
    await expect(transformFileToFortuneSheets(new File([], "预算.xlsx"))).resolves.toEqual([
      { name: "xlsx" },
    ]);
    expect(fortuneExcelMock.transformXlsxFileToFortuneSheets).toHaveBeenCalled();
  });

  it.each(["预算.xls", "数据.csv"])("routes %s to SheetJS", async (fileName) => {
    await expect(transformFileToFortuneSheets(new File([], fileName))).resolves.toEqual([
      { name: "sheetjs" },
    ]);
  });

  it("rejects unsupported formats before parsing", async () => {
    await expect(transformFileToFortuneSheets(new File([], "数据.tsv"))).rejects.toThrow(
      "仅支持 .xlsx、.xls 和 .csv 文件",
    );
  });
});
