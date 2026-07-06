import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";
import {
  sheetChangeCellToZeroBased,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  type SheetChangeDelta,
} from "@openexcel/core";
import {
  applyCellWrite,
  buildSheetChangePreview,
  normalizeWriteOperations,
  type WriteCellsInput,
} from "../domain.js";
import * as repo from "../../sessions/runs/repository.js";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";

export const writeCells = {
  ...excelToolSpecs.writeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    input: WriteCellsInput,
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const { sheetId, operations } = normalizeWriteOperations(input);
    const sheet = await prisma.sheet.findFirst({
      where: { id: sheetId },
      include: { workbook: true },
    });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);
    if (sheet.workbook.workspaceId !== context.workspaceId) throw new Error(`Sheet ${sheetId} 不存在`);

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

    const touchedCells = new Map<string, { row: number; col: number; value: string | number | boolean; formula?: string }>();
    for (const operation of operations) {
      if (operation.type === "cell") {
        const storageCell = sheetChangeCellToZeroBased(operation);
        applyCellWrite(
          cellMap,
          touchedCells,
          storageCell.row,
          storageCell.col,
          storageCell.value,
          storageCell.formula,
        );
        continue;
      }

      const storageRange = sheetChangeRangeToZeroBased({
        startRow: operation.startRow,
        startCol: operation.startCol,
        endRow: operation.endRow,
        endCol: operation.endCol,
      });

      for (let row = storageRange.startRow; row <= storageRange.endRow; row += 1) {
        for (let col = storageRange.startCol; col <= storageRange.endCol; col += 1) {
          applyCellWrite(cellMap, touchedCells, row, col, operation.value, operation.formula);
        }
      }
    }

    const updatedCelldata = Array.from(cellMap.values());

    await prisma.sheet.update({
      where: { id: sheetId },
      data: { uploadedData: JSON.stringify(updatedCelldata) },
    });

    const touchedValues = Array.from(touchedCells.values());
    const minRow = Math.min(...touchedValues.map((cell) => cell.row - 1));
    const maxRow = Math.max(...touchedValues.map((cell) => cell.row - 1));

    const delta: SheetChangeDelta = {
      type: "write",
      cells: touchedValues,
    };

    const output = {
      success: true,
      updatedCells: touchedValues.length,
      delta,
      preview: buildSheetChangePreview(updatedCelldata, sheet.name, sheetId, minRow, maxRow),
      sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
