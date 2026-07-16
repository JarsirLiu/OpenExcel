import { transformExcelToFortune } from "@corbe30/fortune-excel";
import { extractXlsxFilterSelections } from "./xlsxFilterAdapter";

export type FortuneExcelSheet = {
  name?: unknown;
  celldata?: unknown;
  [key: string]: unknown;
};

export async function transformXlsxFileToFortuneSheets(file: File): Promise<FortuneExcelSheet[]> {
  const result: { sheets?: FortuneExcelSheet[] } = {};

  const filterSelections = await extractXlsxFilterSelections(file);
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

  return parsedSheets.map((sheet) => {
    const sheetName = typeof sheet.name === "string" ? sheet.name : undefined;
    const filterSelect = sheetName ? filterSelections[sheetName] : undefined;
    return filterSelect ? { ...sheet, filter_select: filterSelect } : sheet;
  });
}
