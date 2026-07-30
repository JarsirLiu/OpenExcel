import { ToolInputValidationError } from "@openexcel/agent";
import {
  type ExcelToolInput,
  parseWriteRange,
  type SheetMutation,
  storageIndex,
} from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { executeSheetCommandInTransaction } from "../application/executeSheetCommand.js";
import { buildSheetChangePreview } from "../domain/sheetPreview.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

type WriteOperation = ExcelToolInput<"writeCells">["operations"][number];

function compactWriteCellsResult(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const { delta: _delta, preview: _preview, ...summary } = value as Record<string, unknown>;
  return { ...summary, delta: null };
}

function toMutationOperation(operation: WriteOperation) {
  const range = parseWriteRange(operation.range);
  return {
    type: "range" as const,
    ...range,
    value: operation.value,
    values: operation.values,
    valueType: operation.valueType,
    formula: operation.formula,
  };
}

export const writeCells = defineServerTool("writeCells", {
  persistenceMode: "mutation",
  resultBudget: { maxTokens: 4_000, compact: compactWriteCellsResult },
  execute: async (input, options) => {
    const { sheetId, operations } = input;
    const mutationOperations = operations.map(toMutationOperation);
    const ranges = mutationOperations.map(({ startRow, startCol, endRow, endCol }) => ({
      startRow,
      startCol,
      endRow,
      endCol,
    }));
    return runSheetMutation(
      { ...options.context, db: options.db },
      sheetId,
      async (sheet, tx) => {
        if (options.abortSignal?.aborted) {
          throw options.abortSignal.reason instanceof Error
            ? options.abortSignal.reason
            : new ToolInputValidationError("Sheet tool execution was aborted");
        }
        const mutation: SheetMutation = { type: "write", operations: mutationOperations };
        const execution = await executeSheetCommandInTransaction(tx, options.context.workspaceId, {
          kind: "mutation",
          mutationId: createSheetToolMutationId(
            options.context.runId,
            "writeCells",
            options.toolCallId,
          ),
          sheetId,
          baseRevision: sheet.revision,
          mutation,
        });
        const result = execution.result;
        const minRow = Math.min(...ranges.map((range) => range.startRow));
        const maxRow = Math.max(...ranges.map((range) => range.endRow));
        const minCol = Math.min(...ranges.map((range) => range.startCol));
        const maxCol = Math.max(...ranges.map((range) => range.endCol));
        const commandResult = toSheetToolPatchResult(result);
        const output = {
          success: true as const,
          updatedCells: result.changeSummary.changedCellCount,
          ...commandResult,
          ...(result.snapshot
            ? {
                preview: buildSheetChangePreview(
                  result.snapshot.celldata,
                  sheet.name,
                  sheetId,
                  storageIndex(minRow - 1),
                  storageIndex(maxRow - 1),
                  { startCol: storageIndex(minCol - 1), endCol: storageIndex(maxCol - 1) },
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
