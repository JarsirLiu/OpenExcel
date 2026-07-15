import { transformExcelToFortune } from "@corbe30/fortune-excel";

export type FortuneExcelSheet = {
  name?: unknown;
  celldata?: unknown;
  [key: string]: unknown;
};

export async function transformXlsxFileToFortuneSheets(file: File): Promise<FortuneExcelSheet[]> {
  const result: { sheets?: FortuneExcelSheet[] } = {};

  await transformExcelToFortune(
    file,
    (sheets: FortuneExcelSheet[]) => {
      result.sheets = sheets;
    },
    () => undefined,
    undefined,
  );

  const parsedSheets = result.sheets;
  if (!Array.isArray(parsedSheets) || parsedSheets.length === 0) {
    throw new Error("工作簿不包含可导入的工作表");
  }

  return parsedSheets;
}
