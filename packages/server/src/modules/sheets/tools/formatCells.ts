import { type ExcelToolInput, parseWriteRange, type SheetMutation } from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { executeSheetCommandInTransaction } from "../application/executeSheetCommand.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

type FormatOperation = ExcelToolInput<"formatCells">["operations"][number];

function compactFormatCellsResult(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const { delta: _delta, ...summary } = value as Record<string, unknown>;
  return { ...summary, delta: null };
}

function toMutationOperation(operation: FormatOperation) {
  return {
    type: "range" as const,
    ...parseWriteRange(operation.range),
    fill: operation.fill,
    fontColor: operation.fontColor,
  };
}

export const formatCells = defineServerTool("formatCells", {
  persistenceMode: "mutation",
  resultBudget: { maxTokens: 4_000, compact: compactFormatCellsResult },
  execute: async (input, options) => {
    const mutationOperations = input.operations.map(toMutationOperation);
    return runSheetMutation(
      { ...options.context, db: options.db },
      input.sheetId,
      async (sheet, tx) => {
        const mutation: SheetMutation = { type: "format", operations: mutationOperations };
        const execution = await executeSheetCommandInTransaction(tx, options.context.workspaceId, {
          kind: "mutation",
          mutationId: createSheetToolMutationId(
            options.context.runId,
            "formatCells",
            options.toolCallId,
          ),
          sheetId: input.sheetId,
          baseRevision: sheet.revision,
          mutation,
        });
        const result = execution.result;
        const output = {
          success: true as const,
          updatedCells: result.changeSummary.changedCellCount,
          ...toSheetToolPatchResult(result),
          sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
        };
        return { result: output, outcome: execution.outcome };
      },
      options.abortSignal,
    );
  },
});
