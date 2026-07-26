import {
  type ExcelToolInput,
  type SheetChangeCell,
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

export const writeCells = defineServerTool("writeCells", {
  execute: async (input, options) => {
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
        success: true as const,
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
      return output;
    });
  },
});
