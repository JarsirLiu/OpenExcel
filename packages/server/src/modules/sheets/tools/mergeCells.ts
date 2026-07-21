import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeRangeOperation,
  type SheetMutation,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  storageIndex,
  toolIndex,
  toolRangeToA1Ref,
} from "@openexcel/core";
import { executeSheetCommand } from "../application/executeSheetCommand.js";
import { buildSheetChangePreview } from "../domain/sheetPreview.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

export const mergeCells = {
  ...excelToolSpecs.mergeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { sheetId: number; operations: SheetChangeRangeOperation[] },
    options: { context: { runId: number; workspaceId: number }; toolCallId?: string },
  ) => {
    return runSheetMutation(options.context, input.sheetId, async (sheet) => {
      const mutation: SheetMutation = { type: "merge", operations: input.operations };
      const result = await executeSheetCommand(options.context.workspaceId, {
        kind: "mutation",
        mutationId: createSheetToolMutationId(
          options.context.runId,
          "mergeCells",
          options.toolCallId,
        ),
        sheetId: input.sheetId,
        baseRevision: sheet.revision,
        mutation,
      });
      const ranges = input.operations.map(sheetChangeRangeToZeroBased);
      const { snapshot } = result;
      const commandResult = toSheetToolPatchResult(result);
      const output = {
        success: true,
        mergedRanges: input.operations.map((operation) =>
          toolRangeToA1Ref({
            startRow: toolIndex(operation.startRow),
            startCol: toolIndex(operation.startCol),
            endRow: toolIndex(operation.endRow),
            endCol: toolIndex(operation.endCol),
          }),
        ),
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
