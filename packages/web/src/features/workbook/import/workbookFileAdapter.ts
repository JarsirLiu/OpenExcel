import { type FortuneExcelSheet, transformXlsxFileToFortuneSheets } from "./fortuneExcelAdapter";
import { transformSheetJsFileToFortuneSheets } from "./sheetJsAdapter";

function extensionOf(file: File): string {
  const match = file.name.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] ?? "";
}

export async function transformFileToFortuneSheets(file: File): Promise<FortuneExcelSheet[]> {
  switch (extensionOf(file)) {
    case "xlsx":
      return transformXlsxFileToFortuneSheets(file);
    case "xls":
    case "csv":
      return transformSheetJsFileToFortuneSheets(file);
    default:
      throw new Error("仅支持 .xlsx、.xls 和 .csv 文件");
  }
}
