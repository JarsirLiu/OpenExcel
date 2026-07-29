import { estimateTokens, ToolNotFoundError } from "@openexcel/agent";
import type { ExcelToolInput } from "@openexcel/core";
import {
  parseSheetToolRange,
  projectSheetData,
  type SheetReadContinuation,
  type SheetToolRange,
  sheetToolRangeToA1,
} from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { sheetRecordToSnapshot } from "../../../shared/utils/sheetSnapshot.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

const MAX_CELLS_PER_READ = 4_000;

type ReadSheetDataInput = ExcelToolInput<"readSheetData">;

function toCoreContinuation(
  continuation: ReadSheetDataInput["continuation"],
): SheetReadContinuation | undefined {
  if (!continuation) return undefined;
  return {
    requestedRange: parseSheetToolRange(continuation.requestedRange),
    nextRow: continuation.nextRow,
    nextCol: continuation.nextCol,
  };
}

function serializeContinuation(continuation: SheetReadContinuation | null) {
  if (!continuation) return null;
  return {
    ...continuation,
    requestedRange: sheetToolRangeToA1(continuation.requestedRange),
  };
}

export const readSheetData = defineServerTool("readSheetData", {
  resultBudget: { maxTokens: 8_000, compact: (value) => value },
  execute: async (
    { sheetId, range, continuation }: ReadSheetDataInput,
    { context, resultBudget },
  ) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new ToolNotFoundError(`Sheet ${sheetId} 不存在`);

    const coreContinuation = toCoreContinuation(continuation);
    const requestedRange: SheetToolRange | undefined = range
      ? parseSheetToolRange(range)
      : coreContinuation?.requestedRange;
    const celldata = sheetRecordToSnapshot(sheet).celldata;
    const project = (maxCells: number) => {
      const projection = projectSheetData(celldata, {
        requestedRange,
        continuation: coreContinuation,
        maxCells,
      });
      return {
        workbook: { id: sheet.workbook.id, name: sheet.workbook.name },
        sheet: { id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name },
        ...projection,
        continuation: serializeContinuation(projection.continuation),
      };
    };

    let result = project(MAX_CELLS_PER_READ);
    let pageSize = MAX_CELLS_PER_READ;
    while (resultBudget && estimateTokens(result) > resultBudget.maxTokens && pageSize > 1) {
      const nextPageSize = Math.max(1, Math.floor(pageSize * 0.75));
      if (nextPageSize === pageSize) break;
      pageSize = nextPageSize;
      result = project(pageSize);
    }

    return result;
  },
});
