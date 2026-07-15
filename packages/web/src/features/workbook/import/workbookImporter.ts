import {
  extractMergesFromCelldata,
  extractSheetConfig,
  type ImportedWorkbookBatchInput,
} from "@openexcel/core";
import type { FortuneExcelSheet } from "./fortuneExcelAdapter";
import { normalizeImportedCelldata } from "./importCellNormalization";
import { transformFileToFortuneSheets } from "./workbookFileAdapter";

export function workbookNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "未命名工作簿";
}

export function normalizeSheet(sheet: FortuneExcelSheet, index: number) {
  const celldata = normalizeImportedCelldata(sheet.celldata);
  const name =
    typeof sheet.name === "string" && sheet.name.trim() ? sheet.name : `Sheet${index + 1}`;

  return {
    name,
    celldata,
    merges: extractMergesFromCelldata(celldata),
    config: extractSheetConfig(sheet),
  };
}

export async function importWorkbookFile(
  file: File,
): Promise<ImportedWorkbookBatchInput["workbooks"][number]> {
  const parsedSheets = await transformFileToFortuneSheets(file);

  return {
    name: workbookNameFromFile(file),
    sheets: parsedSheets.map(normalizeSheet),
  };
}

export async function importWorkbookFiles(
  files: readonly File[],
): Promise<ImportedWorkbookBatchInput> {
  const workbooks = [];
  for (const file of files) {
    workbooks.push(await importWorkbookFile(file));
  }
  return { workbooks };
}
