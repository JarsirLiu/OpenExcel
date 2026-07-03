import { excelToolSpecs, sheetMutationContextSchema } from "@openexcel/agent";
import { prisma } from "../../db.js";
import {
  sheetChangePatchOutputSchema,
  type SheetChangeDelta,
  type SheetChangeClearOperation,
} from "@openexcel/core";
import { applyClearOperation, buildSheetChangePreview } from "../domain.js";
import * as repo from "../../session/repository.js";
import { sheetRecordToCelldata } from "../../utils/sheetData.js";

export const clearCells = {
  ...excelToolSpecs.clearCells,
  contextSchema: sheetMutationContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeClearOperation[] },
    { context }: { context: { runId: number } },
  ) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

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
      const touchedKeys = applyClearOperation(cellMap, operation);
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
      sheetInfo: { sheetId: sheet.id, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
