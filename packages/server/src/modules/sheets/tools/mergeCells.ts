import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  formatA1Range,
  type SheetChangeDelta,
  type SheetChangeRangeOperation,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
} from "@openexcel/core";
import {
  mergeOperationToDocument,
  mergeRanges,
  rangeForWriteOperation,
} from "../../documents/toolDocumentOperations.js";
import { applyToolOperations, readToolRange } from "../../documents/toolMutationBridge.js";
import { buildToolPreview } from "../../documents/toolPreview.js";

export const mergeCells = {
  ...excelToolSpecs.mergeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeRangeOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const ranges = operations.map((operation) => ({ ...operation, value: "" }));
    const previewRange = mergeRanges(
      ranges.map((operation) =>
        rangeForWriteOperation({
          ...operation,
        }),
      ),
    );
    const documentOperations = operations.map(mergeOperationToDocument);
    const { sheet, mutation } = await applyToolOperations(
      context.workspaceId,
      sheetId,
      documentOperations,
      context.runId,
    );
    const previewData = await readToolRange(context.workspaceId, sheetId, previewRange);
    const delta: SheetChangeDelta = { type: "merge", operations };
    const output = {
      success: true,
      mutation,
      mergedRanges: operations.map((operation) =>
        formatA1Range(sheetChangeRangeToZeroBased(operation)),
      ),
      delta,
      preview: buildToolPreview(sheet, previewRange, previewData.cells, previewData.objects),
      sheetInfo: { sheetId: sheet.sheetId, sheetNo: sheet.sheetNo, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
