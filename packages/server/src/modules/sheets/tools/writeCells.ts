import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeCell,
  type SheetMutation,
  sheetChangePatchOutputSchema,
  storageIndex,
} from "@openexcel/core";
import { executeSheetCommandInTransaction } from "../application/executeSheetCommand.js";
import { buildSheetChangePreview } from "../domain/sheetPreview.js";
import { runSheetMutation } from "./runSheetMutation.js";
import { createSheetToolMutationId } from "./sheetToolCommand.js";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

type CellWriteValue = string | number | boolean;
type WriteOperation =
  | { type: "cell"; row: number; col: number; value: CellWriteValue; formula?: string }
  | {
      type: "range";
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
      value: CellWriteValue;
      formula?: string;
    };

function expandOperations(operations: WriteOperation[]): SheetChangeCell[] {
  const cells: SheetChangeCell[] = [];
  for (const operation of operations) {
    if (operation.type === "cell") {
      cells.push(operation);
      continue;
    }
    for (let row = operation.startRow; row <= operation.endRow; row++) {
      for (let col = operation.startCol; col <= operation.endCol; col++) {
        cells.push({ row, col, value: operation.value, formula: operation.formula });
      }
    }
  }
  return cells;
}

function affectedRange(cells: SheetChangeCell) {
  return {
    startRow: storageIndex(cells.row - 1),
    endRow: storageIndex(cells.row - 1),
    startCol: storageIndex(cells.col - 1),
    endCol: storageIndex(cells.col - 1),
  };
}

export const writeCells = {
  ...excelToolSpecs.writeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { sheetId: number; operations: WriteOperation[] },
    options: { context: { runId: number; workspaceId: number }; toolCallId?: string },
  ) => {
    const { sheetId, operations } = input;
    return runSheetMutation(options.context, sheetId, async (sheet, tx) => {
      const cells = expandOperations(operations);
      const mutation: SheetMutation = { type: "write", cells };
      const result = await executeSheetCommandInTransaction(tx, options.context.workspaceId, {
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
      const ranges = cells.map(affectedRange);
      const minRow = Math.min(...ranges.map((range) => range.startRow));
      const maxRow = Math.max(...ranges.map((range) => range.endRow));
      const minCol = Math.min(...ranges.map((range) => range.startCol));
      const maxCol = Math.max(...ranges.map((range) => range.endCol));
      const { snapshot } = result;
      const commandResult = toSheetToolPatchResult(result);
      const output = {
        success: true,
        updatedCells: result.changeSummary.changedCellCount,
        ...commandResult,
        preview: buildSheetChangePreview(
          snapshot.celldata,
          sheet.name,
          sheetId,
          storageIndex(minRow),
          storageIndex(maxRow),
          { startCol: storageIndex(minCol), endCol: storageIndex(maxCol) },
        ),
        sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
      };
      sheetChangePatchOutputSchema.parse(output);
      return output;
    });
  },
};
