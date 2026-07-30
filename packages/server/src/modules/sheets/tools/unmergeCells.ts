import {
  type SheetMutation,
  sheetChangeRangeToZeroBased,
  storageIndex,
  toolIndex,
  toolRangeToA1Ref,
} from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { executeSheetCommandInTransaction } from "../application/executeSheetCommand.js";
import { buildSheetChangePreview } from "../domain/sheetPreview.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

export const unmergeCells = defineServerTool("unmergeCells", {
  persistenceMode: "mutation",
  resultBudget: { maxTokens: 4_000, compact: (value) => value },
  execute: async (input, options) => {
    return runSheetMutation(
      { ...options.context, db: options.db },
      input.sheetId,
      async (sheet, tx) => {
        const mutation: SheetMutation = { type: "unmerge", operations: input.operations };
        const execution = await executeSheetCommandInTransaction(tx, options.context.workspaceId, {
          kind: "mutation",
          mutationId: createSheetToolMutationId(
            options.context.runId,
            "unmergeCells",
            options.toolCallId,
          ),
          sheetId: input.sheetId,
          baseRevision: sheet.revision,
          mutation,
        });
        const result = execution.result;
        const ranges = input.operations.map(sheetChangeRangeToZeroBased);
        const commandResult = toSheetToolPatchResult(result);
        const output = {
          success: true as const,
          unmergedRanges: input.operations.map((operation) =>
            toolRangeToA1Ref({
              startRow: toolIndex(operation.startRow),
              startCol: toolIndex(operation.startCol),
              endRow: toolIndex(operation.endRow),
              endCol: toolIndex(operation.endCol),
            }),
          ),
          ...commandResult,
          ...(result.snapshot
            ? {
                preview: buildSheetChangePreview(
                  result.snapshot.celldata,
                  sheet.name,
                  input.sheetId,
                  storageIndex(Math.min(...ranges.map((range) => range.startRow))),
                  storageIndex(Math.max(...ranges.map((range) => range.endRow))),
                  {
                    startCol: storageIndex(Math.min(...ranges.map((range) => range.startCol))),
                    endCol: storageIndex(Math.max(...ranges.map((range) => range.endCol))),
                  },
                ),
              }
            : {}),
          sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
        };
        return { result: output, outcome: execution.outcome };
      },
      options.abortSignal,
    );
  },
});
