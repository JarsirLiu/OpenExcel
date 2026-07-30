import { ToolNotFoundError } from "@openexcel/agent";
import type { ExcelToolInput } from "@openexcel/core";
import {
  parseSheetToolRange,
  projectSheetData,
  projectSheetOverview,
  projectSheetTable,
  querySheetCells,
  type SheetReadContinuation,
  type SheetToolRange,
  sheetToolRangeToA1,
} from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { sheetRecordToSnapshot } from "../../../shared/utils/sheetSnapshot.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

const MAX_CELLS_PER_READ = 4_000;

type ReadSheetDataInput = ExcelToolInput<"readSheetData">;
type ReadSheetRangeInput = Extract<ReadSheetDataInput, { operation: "range" }>;

function toCoreContinuation(
  continuation: ReadSheetRangeInput["continuation"],
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
  persistenceMode: "read",
  resultBudget: { maxTokens: 8_000, compact: (value) => value },
  execute: async (input: ReadSheetDataInput, { context }) => {
    const sheet = await findSheetForWorkspace(input.sheetId, context.workspaceId);
    if (!sheet) throw new ToolNotFoundError(`Sheet ${input.sheetId} 不存在`);

    const celldata = sheetRecordToSnapshot(sheet).celldata;
    const workbook = { id: sheet.workbook.id, name: sheet.workbook.name };
    const sheetSummary = { id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name };

    if (input.operation === "overview") {
      return {
        mode: "overview" as const,
        workbook,
        sheet: sheetSummary,
        ...projectSheetOverview(celldata),
      };
    }

    if (input.operation === "find") {
      const matches = querySheetCells(celldata, input.query, {
        range: input.range ? parseSheetToolRange(input.range) : undefined,
      });
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 50;
      const page = matches.slice(offset, offset + limit);
      return {
        mode: "find" as const,
        workbook,
        sheet: sheetSummary,
        matches: page,
        nextOffset: offset + page.length < matches.length ? offset + page.length : null,
      };
    }

    if (input.range && input.continuation) {
      throw new Error("Sheet range and continuation cannot be provided together");
    }

    const coreContinuation = toCoreContinuation(input.continuation);
    const requestedRange: SheetToolRange | undefined = input.range
      ? parseSheetToolRange(input.range)
      : coreContinuation?.requestedRange;
    if (input.format === "exact") {
      const project = (maxCells: number) => {
        const projection = projectSheetData(celldata, {
          requestedRange,
          continuation: coreContinuation,
          maxCells,
        });
        return {
          mode: "exact" as const,
          workbook,
          sheet: sheetSummary,
          ...projection,
          continuation: serializeContinuation(projection.continuation),
        };
      };

      return project(MAX_CELLS_PER_READ);
    }

    const project = (maxCells: number) => {
      const projection = projectSheetTable(celldata, {
        requestedRange,
        continuation: coreContinuation,
        maxCells,
      });
      return {
        mode: "compact" as const,
        workbook,
        sheet: sheetSummary,
        ...projection,
        continuation: serializeContinuation(projection.continuation),
      };
    };

    return project(MAX_CELLS_PER_READ);
  },
});
