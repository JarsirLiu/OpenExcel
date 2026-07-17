import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeClearOperation,
  type SheetChangeDelta,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  storageIndex,
  toolIndex,
  toolIndexToStorage,
} from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import { applyClearOperation, buildSheetChangePreview } from "../domain/sheet.js";
import * as sheetRepo from "../infrastructure/sheetRepository.js";
import { runSheetMutation } from "./runSheetMutation.js";

export const clearCells = {
  ...excelToolSpecs.clearCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeClearOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    return runSheetMutation(context, sheetId, async (sheet) => {
      const celldata: any[] = sheetRecordToCelldata(sheet);
      if (!Array.isArray(celldata)) throw new Error("celldata 格式错误");

      const cellMap = new Map<string, any>();
      for (const cell of celldata) {
        cellMap.set(`${cell.r},${cell.c}`, cell);
      }

      const touchedCellKeys = new Set<string>();
      const touchedRowIndices = new Set<number>();
      for (const operation of operations) {
        const zeroBased =
          operation.type === "cell"
            ? {
                type: "cell" as const,
                row: toolIndexToStorage(toolIndex(operation.row)),
                col: toolIndexToStorage(toolIndex(operation.col)),
              }
            : { type: "range" as const, ...sheetChangeRangeToZeroBased(operation) };
        const touchedKeys = applyClearOperation(cellMap, zeroBased);
        for (const key of touchedKeys) {
          touchedCellKeys.add(key);
          const [row] = key.split(",");
          touchedRowIndices.add(Number(row));
        }
      }

      const updatedCelldata = Array.from(cellMap.values());

      await sheetRepo.updateSheetContent(
        sheetId,
        JSON.stringify(updatedCelldata),
        context.workspaceId,
      );

      const touchedRows = Array.from(touchedRowIndices.values());
      const minRow = storageIndex(touchedRows.length > 0 ? Math.min(...touchedRows) : 0);
      const maxRow = storageIndex(touchedRows.length > 0 ? Math.max(...touchedRows) : 0);

      const delta: SheetChangeDelta = {
        type: "clear",
        operations,
      };

      const output = {
        success: true,
        clearedCells: touchedCellKeys.size,
        delta,
        preview: buildSheetChangePreview(updatedCelldata, sheet.name, sheetId, minRow, maxRow),
        sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
      };

      sheetChangePatchOutputSchema.parse(output);
      return output;
    });
  },
};
