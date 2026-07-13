import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  formatA1Range,
  type SheetChangeDelta,
  type SheetChangeRangeOperation,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
} from "@openexcel/core";
import { isMergeObject, mergeRanges } from "../../documents/toolDocumentOperations.js";
import { applyToolOperations, readToolRange } from "../../documents/toolMutationBridge.js";
import { buildToolPreview } from "../../documents/toolPreview.js";

export const unmergeCells = {
  ...excelToolSpecs.unmergeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeRangeOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const ranges = operations.map((operation) => sheetChangeRangeToZeroBased(operation));
    const previewRange = mergeRanges(ranges);
    const before = await readToolRange(context.workspaceId, sheetId, previewRange);
    const deleteOperations = before.objects
      .filter(isMergeObject)
      .filter((object) => {
        const position = object.position;
        return ranges.some(
          (range) =>
            typeof position.startRow === "number" &&
            typeof position.endRow === "number" &&
            typeof position.startCol === "number" &&
            typeof position.endCol === "number" &&
            position.startRow <= range.endRow &&
            position.endRow >= range.startRow &&
            position.startCol <= range.endCol &&
            position.endCol >= range.startCol,
        );
      })
      .map((object) => ({ type: "deleteObject" as const, id: object.id }));
    const { sheet, mutation } = await applyToolOperations(
      context.workspaceId,
      sheetId,
      deleteOperations,
      context.runId,
    );
    const after = await readToolRange(context.workspaceId, sheetId, previewRange);
    const delta: SheetChangeDelta = { type: "unmerge", operations };
    const output = {
      success: true,
      mutation,
      unmergedRanges: operations.map((operation) =>
        formatA1Range(sheetChangeRangeToZeroBased(operation)),
      ),
      delta,
      preview: buildToolPreview(sheet, previewRange, after.cells, after.objects),
      sheetInfo: { sheetId: sheet.sheetId, sheetNo: sheet.sheetNo, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
