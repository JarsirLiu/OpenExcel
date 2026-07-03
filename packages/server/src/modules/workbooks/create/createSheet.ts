import { gridToCelldata } from "@openexcel/core";
import * as repo from "../repository.js";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";

export async function createSheet(workbookId: number, name?: string, sourceSheetId?: number) {
  const workbook = await repo.findWorkbookWithSheets(workbookId);
  if (!workbook) return null;

  const sourceSheet = sourceSheetId
    ? workbook.sheets.find((sheet) => sheet.id === sourceSheetId)
    : workbook.sheets[workbook.sheets.length - 1];

  const nextOrder = workbook.sheets.length;
  const nextName = name?.trim() || `Sheet${nextOrder + 1}`;
  const sourceColumns = sourceSheet ? JSON.parse(sourceSheet.columns) as { label: string; width?: number }[] : [{ label: "A" }];
  const sourceMerges = sourceSheet ? JSON.parse(sourceSheet.merges) as { row: [number, number]; col: [number, number] }[] : [];
  const schema = {
    columns: JSON.stringify(sourceColumns),
    merges: JSON.stringify(sourceMerges),
  };
  const celldata = sourceSheet
    ? sheetRecordToCelldata(sourceSheet)
    : gridToCelldata([[]], ["A"]);

  const sheet = await repo.createSheet({
    workbookId,
    name: nextName,
    order: nextOrder,
    columns: schema.columns,
    merges: schema.merges,
    uploadedData: JSON.stringify(celldata),
  });

  return { id: sheet.id, name: sheet.name, order: sheet.order };
}
