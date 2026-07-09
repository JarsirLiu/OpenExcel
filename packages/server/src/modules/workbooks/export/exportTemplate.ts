import { celldataToExcel } from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import { deserializeSheet } from "../../../shared/utils/sheetSerialization.js";
import * as repo from "../repository.js";

export async function exportTemplate(workspaceId: number, id: number) {
  const wb = await repo.findWorkbookWithSheets(id, workspaceId);
  if (!wb) return null;

  const sheets = wb.sheets.map((s) => {
    const parsed = deserializeSheet(s);
    const celldata = sheetRecordToCelldata(s);
    const fallbackRows =
      celldata.length > 0 ? undefined : [parsed.columns.map((column) => column.label)];
    const columnWidths = parsed.columns.reduce(
      (acc: Record<string, number>, column: { label: string; width?: number }, index: number) => {
        if (column.width != null) acc[index] = column.width;
        return acc;
      },
      {},
    );

    return {
      name: s.name,
      celldata,
      config: parsed.config,
      columnWidths,
      fallbackRows,
    };
  });

  const ab = celldataToExcel(sheets);
  return { buffer: Buffer.from(ab), name: wb.name };
}
