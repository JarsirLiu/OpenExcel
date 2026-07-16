import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transformExcelToFortune: vi.fn(),
  extractXlsxFilterSelections: vi.fn(),
}));

vi.mock("@corbe30/fortune-excel", () => ({
  transformExcelToFortune: mocks.transformExcelToFortune,
}));
vi.mock("./xlsxFilterAdapter", () => ({
  extractXlsxFilterSelections: mocks.extractXlsxFilterSelections,
}));

import { transformXlsxFileToFortuneSheets } from "./fortuneExcelAdapter";

describe("fortuneExcelAdapter", () => {
  it("adds filter metadata without changing the primary FortuneExcel result", async () => {
    mocks.transformExcelToFortune.mockImplementationOnce(async (_file, onSuccess) => {
      onSuccess([{ name: "Sheet1", celldata: [] }]);
    });
    mocks.extractXlsxFilterSelections.mockResolvedValueOnce({
      Sheet1: { row: [0, 982], column: [0, 4] },
    });

    await expect(transformXlsxFileToFortuneSheets(new File([], "表1.xlsx"))).resolves.toEqual([
      { name: "Sheet1", celldata: [], filter_select: { row: [0, 982], column: [0, 4] } },
    ]);
  });

  it("associates filter metadata by worksheet name", async () => {
    mocks.transformExcelToFortune.mockImplementationOnce(async (_file, onSuccess) => {
      onSuccess([
        { name: "第二张表", celldata: [] },
        { name: "第一张表", celldata: [] },
      ]);
    });
    mocks.extractXlsxFilterSelections.mockResolvedValueOnce({
      第一张表: { row: [0, 10], column: [0, 4] },
    });

    await expect(transformXlsxFileToFortuneSheets(new File([], "表1.xlsx"))).resolves.toEqual([
      { name: "第二张表", celldata: [] },
      { name: "第一张表", celldata: [], filter_select: { row: [0, 10], column: [0, 4] } },
    ]);
  });
});
