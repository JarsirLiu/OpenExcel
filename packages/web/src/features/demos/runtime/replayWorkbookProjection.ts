import type { WorkbookFull } from "@/api/workbooks";
import type { DemoWorkbook } from "./replayTypes";

export function cloneWorkbooks(workbooks: readonly DemoWorkbook[]): DemoWorkbook[] {
  return workbooks.map((workbook) => ({
    ...workbook,
    sheets: workbook.sheets.map((sheet) => ({
      ...sheet,
      columns: [...sheet.columns],
      rows: sheet.rows.map((row) => row.map((item) => ({ ...item }))),
    })),
  }));
}

export function toWorkbook(workbook: DemoWorkbook, workbookIndex: number): WorkbookFull {
  return {
    id: -101 - workbookIndex,
    publicId: workbook.publicId,
    name: workbook.name,
    charts: [],
    sheets: workbook.sheets.map((sheet, sheetIndex) => ({
      id: -200 - workbookIndex * 10 - sheetIndex,
      sheetNo: sheetIndex + 1,
      name: sheet.name,
      order: sheetIndex,
      columns: sheet.columns.map((label) => ({ label, width: 120 })),
      merges: [],
      uploadedData: sheet.rows.flatMap((row, rowIndex) =>
        row.map((value, colIndex) => ({
          r: rowIndex,
          c: colIndex,
          v: {
            v: value.value,
            m: String(value.value),
            ...(value.formula ? { f: value.formula.replace(/^=/, "") } : {}),
            ...(value.background ? { bg: value.background } : {}),
          },
        })),
      ),
      config: null,
    })),
  };
}
