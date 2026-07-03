import { excelToolSpecs, sheetMutationContextSchema } from "@openexcel/agent";
import { prisma } from "../../../db.js";
import {
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  type SheetChangeDelta,
  type SheetChangeRangeOperation,
} from "@openexcel/core";
import {
  applyMergeOperation,
  buildSheetChangePreview,
  toA1CellRef,
  toA1Range,
} from "../domain.js";
import * as repo from "../../sessions/runRepository.js";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";

export const mergeCells = {
  ...excelToolSpecs.mergeCells,
  contextSchema: sheetMutationContextSchema,
  execute: async (
    { sheetId, operations }: { sheetId: number; operations: SheetChangeRangeOperation[] },
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

    const mergedRanges: string[] = [];
    let minRow = Number.POSITIVE_INFINITY;
    let maxRow = Number.NEGATIVE_INFINITY;

    for (const operation of operations) {
      const storageRange = sheetChangeRangeToZeroBased(operation);
      applyMergeOperation(cellMap, storageRange);
      mergedRanges.push(toA1Range(operation.startRow, operation.startCol, operation.endRow, operation.endCol));
      minRow = Math.min(minRow, storageRange.startRow);
      maxRow = Math.max(maxRow, storageRange.endRow);
    }

    const updatedCelldata = Array.from(cellMap.values());
    const config = sheet.config ? JSON.parse(sheet.config) : {};
    config.merge = { ...(config.merge ?? {}) };
    for (const operation of operations) {
      const storageRange = sheetChangeRangeToZeroBased(operation);
      const cellRef = toA1CellRef(operation.startRow, operation.startCol);
      config.merge[cellRef] = {
        r: storageRange.startRow,
        c: storageRange.startCol,
        rs: storageRange.endRow - storageRange.startRow + 1,
        cs: storageRange.endCol - storageRange.startCol + 1,
      };
    }

    await prisma.sheet.update({
      where: { id: sheetId },
      data: {
        uploadedData: JSON.stringify(updatedCelldata),
        config: JSON.stringify(config),
      },
    });

    const delta: SheetChangeDelta = {
      type: "merge",
      operations,
    };

    const output = {
      success: true,
      mergedRanges,
      delta,
      preview: buildSheetChangePreview(updatedCelldata, sheet.name, sheetId, minRow, maxRow),
      sheetInfo: { sheetId: sheet.id, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
