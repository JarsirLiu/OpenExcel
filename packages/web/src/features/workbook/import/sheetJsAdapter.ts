import type { FortuneCell } from "@openexcel/core";
import { excelAutoFilterRefToFortune } from "@openexcel/core";
import XLSX from "xlsx-js-style";
import type { FortuneExcelSheet } from "./fortuneExcelAdapter";
import { createMergeIndex, toMergeConfig } from "./sheetJsMerges";
import { toFortuneValue } from "./sheetJsStyles";

function buildSheet(name: string, worksheet: XLSX.WorkSheet): FortuneExcelSheet {
  const range = worksheet["!ref"]
    ? XLSX.utils.decode_range(worksheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const merges = worksheet["!merges"] ?? [];
  const mergeIndex = createMergeIndex(merges);
  const celldata: FortuneCell[] = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[ref] as XLSX.CellObject | undefined;
      const merge = mergeIndex.find(r, c);
      if (!cell && !merge) continue;

      const value = cell ? toFortuneValue(cell) : { v: "", m: "" };
      if (merge) {
        value.mc =
          merge.range.s.r === r && merge.range.s.c === c
            ? merge.config
            : { r: merge.config.r, c: merge.config.c };
      }
      celldata.push({ r, c, v: value });
    }
  }

  const config: Record<string, unknown> = {};
  if (merges.length > 0) config.merge = toMergeConfig(merges);
  if (worksheet["!cols"]) {
    config.columnlen = Object.fromEntries(
      worksheet["!cols"]
        .map((column, index) => [index, column?.wch != null ? column.wch * 7 : undefined])
        .filter(([, width]) => width != null),
    );
  }
  if (worksheet["!rows"]) {
    config.rowlen = Object.fromEntries(
      worksheet["!rows"]
        .map((row, index) => [index, row?.hpt])
        .filter(([, height]) => height != null),
    );
  }
  const filterSelect = excelAutoFilterRefToFortune(worksheet["!autofilter"]?.ref);
  return filterSelect
    ? { name, celldata, config, filter_select: filterSelect }
    : { name, celldata, config };
}

export async function transformSheetJsFileToFortuneSheets(
  file: File,
): Promise<FortuneExcelSheet[]> {
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
  const input = isCsv ? await file.text() : await file.arrayBuffer();
  const workbook = XLSX.read(input, {
    type: isCsv ? "string" : "array",
    cellDates: false,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    raw: true,
  });

  return workbook.SheetNames.map((name) => buildSheet(name, workbook.Sheets[name]));
}
