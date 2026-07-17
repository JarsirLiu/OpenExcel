import { gridToCelldata, type SheetDef } from "@openexcel/core";

export type ExampleSheetPersistence = {
  columns: string;
  merges: string;
  uploadedData: string;
};

export function buildExampleSheetPersistence(sheet: SheetDef): ExampleSheetPersistence {
  const columns = sheet.columns ?? [];
  const hasHeader = columns.length > 0;
  const rowOffset = hasHeader ? 1 : 0;
  const headerRow = hasHeader ? columns.map((column) => column.label) : undefined;
  const merges = (sheet.merges ?? []).map((merge) => ({
    row: [merge.row[0] + rowOffset, merge.row[1] + rowOffset],
    col: [merge.col[0], merge.col[1]],
  }));

  return {
    columns: JSON.stringify(columns),
    merges: JSON.stringify(merges),
    uploadedData: JSON.stringify(gridToCelldata(sheet.rows ?? [], headerRow)),
  };
}
