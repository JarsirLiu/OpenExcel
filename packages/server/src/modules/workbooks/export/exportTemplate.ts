import { celldataToExcel } from "@openexcel/core";
import * as sheetRepository from "../../sheets/repository.js";
import * as repo from "../repository.js";

export async function exportTemplate(workspaceId: number, id: number) {
  const wb = await repo.findWorkbookWithSheets(id, workspaceId);
  if (!wb) return null;

  const sheets = (
    await Promise.all(
      wb.sheets.map((sheet) => sheetRepository.readSheetForExport(sheet.id, workspaceId)),
    )
  )
    .filter((sheet): sheet is NonNullable<typeof sheet> => sheet !== null)
    .map((parsed) => {
      const celldata = parsed.celldata;
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
        name: parsed.name,
        celldata,
        config: parsed.config,
        columnWidths,
        fallbackRows,
      };
    });

  const ab = celldataToExcel(sheets);
  return { buffer: Buffer.from(ab), name: wb.name };
}
