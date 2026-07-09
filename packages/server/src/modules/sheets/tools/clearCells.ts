import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeClearOperation,
  type SheetChangeDelta,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  toZeroBasedIndex,
} from "@openexcel/core";
import { prisma } from "../../../infra/database/db.js";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import * as repo from "../../sessions/runs/repository.js";
import { applyClearOperation, buildSheetChangePreview } from "../domain.js";

export const clearCells = {
  ...excelToolSpecs.clearCells,
  contextSchema: runToolContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeClearOperation[] },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const sheet = await prisma.sheet.findFirst({
      where: { id: sheetId },
      include: { workbook: true },
    });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);
    if (sheet.workbook.workspaceId !== context.workspaceId)
      throw new Error(`Sheet ${sheetId} 不存在`);

    await repo.upsertRunSheetSnapshot({
      runId: context.runId,
      sheetId,
      uploadedData: sheet.uploadedData ?? null,
      config: sheet.config ?? null,
    });

    const celldata: any[] = sheetRecordToCelldata(sheet);
    if (!Array.isArray(celldata)) throw new Error("celldata 格式错误");

    const cellMap = new Map<string, any>();
    for (const cell of celldata) {
      cellMap.set(`${cell.r},${cell.c}`, cell);
    }

    const touchedCellKeys = new Set<string>();
    const touchedRowIndices = new Set<number>();
    for (const operation of operations) {
      const zeroBased =
        operation.type === "cell"
          ? {
              type: "cell" as const,
              row: toZeroBasedIndex(operation.row),
              col: toZeroBasedIndex(operation.col),
            }
          : { type: "range" as const, ...sheetChangeRangeToZeroBased(operation) };
      const touchedKeys = applyClearOperation(cellMap, zeroBased);
      for (const key of touchedKeys) {
        touchedCellKeys.add(key);
        const [row] = key.split(",");
        touchedRowIndices.add(Number(row));
      }
    }

    const updatedCelldata = Array.from(cellMap.values());

    await prisma.sheet.update({
      where: { id: sheetId },
      data: { uploadedData: JSON.stringify(updatedCelldata) },
    });

    const touchedRows = Array.from(touchedRowIndices.values());
    const minRow = touchedRows.length > 0 ? Math.min(...touchedRows) : 0;
    const maxRow = touchedRows.length > 0 ? Math.max(...touchedRows) : 0;

    const delta: SheetChangeDelta = {
      type: "clear",
      operations,
    };

    const output = {
      success: true,
      clearedCells: touchedCellKeys.size,
      delta,
      preview: buildSheetChangePreview(updatedCelldata, sheet.name, sheetId, minRow, maxRow),
      sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
