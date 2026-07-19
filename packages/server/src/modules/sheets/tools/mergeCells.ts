import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeDelta,
  type SheetChangeRangeOperation,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  storageIndex,
  toolCellToA1Ref,
  toolIndex,
  toolRangeToA1Ref,
} from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import { applyMergeOperation, buildSheetChangePreview } from "../domain/sheet.js";
import * as sheetRepo from "../infrastructure/sheetRepository.js";
import { runSheetMutation } from "./runSheetMutation.js";

export const mergeCells = {
  ...excelToolSpecs.mergeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeRangeOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    return runSheetMutation(context, sheetId, async (sheet) => {
      const celldata: any[] = sheetRecordToCelldata(sheet);
      if (!Array.isArray(celldata)) throw new Error("celldata 格式错误");

      const cellMap = new Map<string, any>();
      for (const cell of celldata) {
        cellMap.set(`${cell.r},${cell.c}`, cell);
      }

      const mergedRanges: string[] = [];
      let minRow = storageIndex(Number.MAX_SAFE_INTEGER);
      let maxRow = storageIndex(0);

      for (const operation of operations) {
        const storageRange = sheetChangeRangeToZeroBased(operation);
        applyMergeOperation(cellMap, storageRange);
        mergedRanges.push(
          toolRangeToA1Ref({
            startRow: toolIndex(operation.startRow),
            startCol: toolIndex(operation.startCol),
            endRow: toolIndex(operation.endRow),
            endCol: toolIndex(operation.endCol),
          }),
        );
        minRow = storageIndex(Math.min(minRow, storageRange.startRow));
        maxRow = storageIndex(Math.max(maxRow, storageRange.endRow));
      }

      const updatedCelldata = Array.from(cellMap.values());
      const config = sheet.config ? JSON.parse(sheet.config) : {};
      config.merge = { ...(config.merge ?? {}) };
      for (const operation of operations) {
        const storageRange = sheetChangeRangeToZeroBased(operation);
        const cellRef = toolCellToA1Ref(
          toolIndex(operation.startRow),
          toolIndex(operation.startCol),
        );
        config.merge[cellRef] = {
          r: storageRange.startRow,
          c: storageRange.startCol,
          rs: storageRange.endRow - storageRange.startRow + 1,
          cs: storageRange.endCol - storageRange.startCol + 1,
        };
      }

      await sheetRepo.updateSheetState(
        sheetId,
        {
          uploadedData: JSON.stringify(updatedCelldata),
          config: JSON.stringify(config),
        },
        context.workspaceId,
      );

      const delta: SheetChangeDelta = {
        type: "merge",
        operations,
      };

      const output = {
        success: true,
        mergedRanges,
        changeSummary: {
          changedCellCount: 0,
          rangeOperationCount: operations.length,
        },
        delta,
        preview: buildSheetChangePreview(updatedCelldata, sheet.name, sheetId, minRow, maxRow),
        sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
      };

      sheetChangePatchOutputSchema.parse(output);
      return output;
    });
  },
};
