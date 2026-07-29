import { ToolInputValidationError } from "@openexcel/agent";
import {
  type ExcelToolInput,
  MAX_WRITE_CELLS_PER_CALL,
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

function expandOperations(
  operations: WriteOperation[],
  abortSignal?: AbortSignal,
): SheetChangeCell[] {
  const cells: SheetChangeCell[] = [];
  for (const operation of operations) {
    if (abortSignal?.aborted) {
      throw abortSignal.reason instanceof Error ? abortSignal.reason : new Error("工具执行已中断");
    }
    if (operation.type === "cell") {
      if (cells.length >= MAX_WRITE_CELLS_PER_CALL) {
        throw new ToolInputValidationError("单次 writeCells 最多写入 10000 个单元格");
      }
      const cell: SheetChangeCell = {
        row: operation.row,
        col: operation.col,
        value: operation.value,
        valueType: operation.valueType,
      };
      if (operation.formula !== undefined) cell.formula = operation.formula;
      cells.push(cell);
      continue;
    }
    const rangeSize =
      (operation.endRow - operation.startRow + 1) * (operation.endCol - operation.startCol + 1);
    if (cells.length + rangeSize > MAX_WRITE_CELLS_PER_CALL) {
      throw new ToolInputValidationError("单次 writeCells 最多写入 10000 个单元格");
    }
    for (let row = operation.startRow; row <= operation.endRow; row++) {
      for (let col = operation.startCol; col <= operation.endCol; col++) {
        if (abortSignal?.aborted) {
          throw abortSignal.reason instanceof Error
            ? abortSignal.reason
            : new Error("工具执行已中断");
        }
        const cell: SheetChangeCell = {
          row,
          col,
          value: operation.value,
          valueType: operation.valueType,
        };
        if (operation.formula !== undefined) cell.formula = operation.formula;
        cells.push(cell);
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
    return runSheetMutation(
      { ...options.context, db: options.db },
      sheetId,
      async (sheet, tx) => {
        const cells = expandOperations(operations, options.abortSignal);
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
      },
      options.abortSignal,
    );
  },
});
