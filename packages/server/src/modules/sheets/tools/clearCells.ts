import {
  type SheetMutation,
  sheetChangeRangeToZeroBased,
  storageIndex,
  toolIndex,
} from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { executeSheetCommandInTransaction } from "../application/executeSheetCommand.js";
import { buildSheetChangePreview } from "../domain/sheetPreview.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

export const clearCells = defineServerTool("clearCells", {
  execute: async (input, options) => {
    return runSheetMutation(
      { ...options.context, db: options.db },
      input.sheetId,
      async (sheet, tx) => {
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
          success: true as const,
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
        return output;
      },
      options.abortSignal,
    );
  },
});
