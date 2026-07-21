import {
  applySheetMutation,
  type SheetChangeVersion,
  type SheetMutation,
  type SheetSnapshot,
} from "@openexcel/core";
import type { SheetSchema, WorkbookFull } from "@/api/workbooks";

function toSnapshot(sheet: SheetSchema): SheetSnapshot {
  return {
    celldata: Array.isArray(sheet.uploadedData) ? sheet.uploadedData : [],
    config:
      sheet.config && typeof sheet.config === "object" && !Array.isArray(sheet.config)
        ? sheet.config
        : null,
  };
}

export function patchWorkbookWithDelta(
  workbook: WorkbookFull,
  sheetId: number,
  mutation: SheetMutation,
  version?: SheetChangeVersion,
): WorkbookFull | null {
  const sheetIndex = workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (sheetIndex === -1) return null;

  const sheet = workbook.sheets[sheetIndex];
  if (version && sheet.revision !== version.baseRevision) return null;

  const applied = applySheetMutation(toSnapshot(sheet), mutation);
  const updatedSheet: SheetSchema = {
    ...sheet,
    uploadedData: applied.snapshot.celldata,
    config: applied.snapshot.config,
    revision: version?.revision ?? sheet.revision,
  };

  return {
    ...workbook,
    sheets: workbook.sheets.map((current, index) =>
      index === sheetIndex ? updatedSheet : current,
    ),
  };
}
