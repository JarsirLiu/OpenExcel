import type { WorkbookFull } from "@/api/workbooks";
import type { DemoWorkbook } from "./replayTypes";

const NUMBER_TOKEN = /[0#?][0#?,]*(?:\.[0#?]+)?/;

function displayValue(value: string | number, numberFormat?: string): string {
  if (typeof value !== "number" || !numberFormat || !Number.isFinite(value)) {
    return String(value);
  }

  const sections = numberFormat.split(";");
  const section = value < 0 && sections[1] ? sections[1] : (sections[0] ?? numberFormat);
  const match = section.match(NUMBER_TOKEN);
  if (!match || match.index == null) return String(value);

  const token = match[0];
  const [integerPattern, fractionPattern] = token.split(".");
  const decimalPlaces = fractionPattern?.length ?? 0;
  const minimumFractionDigits = fractionPattern
    ? [...fractionPattern].filter((character) => character === "0").length
    : 0;
  const percentScale = (section.match(/%/g)?.length ?? 0) > 0 ? 100 : 1;
  const absoluteValue = Math.abs(value) * percentScale;
  const formatted = new Intl.NumberFormat("en-US", {
    useGrouping: integerPattern.includes(","),
    minimumFractionDigits,
    maximumFractionDigits: decimalPlaces,
  }).format(absoluteValue);
  const prefix = section.slice(0, match.index).replace(/\[[^\]]+\]/g, "");
  const suffix = section.slice(match.index + token.length).replace(/\[[^\]]+\]/g, "");
  const sign = value < 0 && sections.length < 2 && !prefix.includes("-") ? "-" : "";

  return `${prefix}${sign}${formatted}${suffix}`;
}

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
      revision: 0,
      uploadedData: sheet.rows.flatMap((row, rowIndex) =>
        row.map((value, colIndex) => ({
          r: rowIndex,
          c: colIndex,
          v: {
            v: value.value,
            m: displayValue(value.value, value.numberFormat),
            ...(value.formula ? { f: value.formula.replace(/^=/, "") } : {}),
            ...(value.background ? { bg: value.background } : {}),
            ...(value.numberFormat ? { ct: { fa: value.numberFormat, t: "n" } } : {}),
          },
        })),
      ),
      config: null,
    })),
  };
}
