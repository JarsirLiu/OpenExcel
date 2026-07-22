import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeClearOperation,
  type SheetMutation,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  storageIndex,
  toolIndex,
} from "@openexcel/core";
import { executeSheetCommandInTransaction } from "../application/executeSheetCommand.js";
import { buildSheetChangePreview } from "../domain/sheetPreview.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

export const clearCells = {
  ...excelToolSpecs.clearCells,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { sheetId: number; operations: SheetChangeClearOperation[] },
    options: { context: { runId: number; workspaceId: number }; toolCallId?: string },
  ) => {
    return runSheetMutation(options.context, input.sheetId, async (sheet, tx) => {
      const mutation: SheetMutation = { type: "clear", operations: input.operations };
      const result = await executeSheetCommandInTransaction(tx, options.context.workspaceId, {
        kind: "mutation",
        mutationId: createSheetToolMutationId(
          options.context.runId,
          "clearCells",
          options.toolCallId,
        ),
        sheetId: input.sheetId,
        baseRevision: sheet.revision,
        mutation,
      });
      const ranges = input.operations.map((operation) =>
        operation.type === "cell"
          ? {
              startRow: toolIndex(operation.row) - 1,
              endRow: toolIndex(operation.row) - 1,
              startCol: toolIndex(operation.col) - 1,
              endCol: toolIndex(operation.col) - 1,
            }
          : sheetChangeRangeToZeroBased(operation),
      );
      const { snapshot } = result;
      const commandResult = toSheetToolPatchResult(result);
      const output = {
        success: true,
        clearedCells: result.changeSummary.changedCellCount,
        ...commandResult,
        preview: buildSheetChangePreview(
          snapshot.celldata,
          sheet.name,
          input.sheetId,
          storageIndex(Math.min(...ranges.map((range) => range.startRow))),
          storageIndex(Math.max(...ranges.map((range) => range.endRow))),
          {
            startCol: storageIndex(Math.min(...ranges.map((range) => range.startCol))),
            endCol: storageIndex(Math.max(...ranges.map((range) => range.endCol))),
          },
        ),
        sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
      };
      sheetChangePatchOutputSchema.parse(output);
      return output;
    });
  },
};
