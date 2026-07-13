import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeClearOperation,
  type SheetChangeDelta,
  sheetChangePatchOutputSchema,
} from "@openexcel/core";
import {
  applyToolOperations,
  buildToolPreview,
  clearOperationToDocument,
  mergeRanges,
  rangeForClearOperation,
  readToolRange,
} from "../../documents/toolAdapter.js";

export const clearCells = {
  ...excelToolSpecs.clearCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeClearOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const ranges = operations.map(rangeForClearOperation);
    const previewRange = mergeRanges(ranges);
    const before = await readToolRange(context.workspaceId, sheetId, previewRange);
    const beforeKeys = new Set(before.cells.map((cell) => `${cell.row},${cell.col}`));
    const documentOperations = operations.map(clearOperationToDocument);
    const { sheet, mutation } = await applyToolOperations(
      context.workspaceId,
      sheetId,
      documentOperations,
      context.runId,
    );
    const after = await readToolRange(context.workspaceId, sheetId, previewRange);
    const delta: SheetChangeDelta = { type: "clear", operations };
    const output = {
      success: true,
      mutation,
      clearedCells:
        beforeKeys.size - new Set(after.cells.map((cell) => `${cell.row},${cell.col}`)).size,
      delta,
      preview: buildToolPreview(sheet, previewRange, after.cells),
      sheetInfo: { sheetId: sheet.sheetId, sheetNo: sheet.sheetNo, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
