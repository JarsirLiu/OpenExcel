import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeDelta,
  type SheetChangeRangeOperation,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
} from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import { buildSheetChangePreview, toA1Range } from "../domain/sheet.js";
import * as sheetRepo from "../infrastructure/sheetRepository.js";
import { runSheetMutation } from "./runSheetMutation.js";

export const unmergeCells = {
  ...excelToolSpecs.unmergeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeRangeOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    return runSheetMutation(context, sheetId, async (sheet) => {
      const celldata: any[] = sheetRecordToCelldata(sheet);
      if (!Array.isArray(celldata)) throw new Error("celldata 格式错误");

      const storageRanges = operations.map(sheetChangeRangeToZeroBased);

      for (const range of storageRanges) {
        for (const cell of celldata) {
          if (
            cell.r >= range.startRow &&
            cell.r <= range.endRow &&
            cell.c >= range.startCol &&
            cell.c <= range.endCol
          ) {
            if (cell.v?.mc) {
              const { mc, ...rest } = cell.v;
              cell.v = rest;
            }
          }
        }
      }

      const config = sheet.config ? JSON.parse(sheet.config) : {};
      if (config.merge) {
        for (const range of storageRanges) {
          for (const key of Object.keys(config.merge)) {
            const m = config.merge[key];
            if (
              m.r >= range.startRow &&
              m.r <= range.endRow &&
              m.c >= range.startCol &&
              m.c <= range.endCol
            ) {
              delete config.merge[key];
            }
          }
        }
      }

      await sheetRepo.updateSheetState(
        sheetId,
        {
          uploadedData: JSON.stringify(celldata),
          config: JSON.stringify(config),
        },
        context.workspaceId,
      );

      const minRow = Math.min(...storageRanges.map((range) => range.startRow));
      const maxRow = Math.max(...storageRanges.map((range) => range.endRow));

      const delta: SheetChangeDelta = {
        type: "unmerge",
        operations,
      };

      const output = {
        success: true,
        unmergedRanges: operations.map((operation) =>
          toA1Range(operation.startRow, operation.startCol, operation.endRow, operation.endCol),
        ),
        delta,
        preview: buildSheetChangePreview(celldata, sheet.name, sheetId, minRow, maxRow),
        sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
      };

      sheetChangePatchOutputSchema.parse(output);
      return output;
    });
  },
};
