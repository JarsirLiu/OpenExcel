import { prisma } from "../../db.js";
import {
  sheetChangeClearOperationSchema,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  type SheetChangeDelta,
  type SheetChangeClearOperation,
} from "@openexcel/core";
import { z } from "zod";
import { buildSheetChangePreview } from "./preview.js";
import { sheetMutationContextSchema } from "../undo.js";
import * as repo from "../repository.js";
import { sheetRecordToCelldata } from "../../utils/sheetData.js";

const clearCellsInputSchema = z.object({
  sheetId: z.coerce.number().describe("Sheet ID"),
  operations: z.array(sheetChangeClearOperationSchema).min(1).describe("清空操作列表，支持离散单元格和连续范围"),
});

function stripCellContent(value: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!value) return null;
  const { v: _cellValue, m: _displayValue, ...rest } = value;
  return Object.keys(rest).length > 0 ? rest : null;
}

function applyClearOperation(
  cellMap: Map<string, any>,
  operation: SheetChangeClearOperation,
) {
  const touchedKeys: string[] = [];

  const clearCell = (row0: number, col0: number) => {
    const key = `${row0},${col0}`;
    const cell = cellMap.get(key);
    if (!cell?.v) return;

    const cleaned = stripCellContent(cell.v);
    if (cleaned) {
      cell.v = cleaned;
    } else {
      cellMap.delete(key);
    }
    touchedKeys.push(key);
  };

  if (operation.type === "cell") {
    clearCell(operation.row - 1, operation.col - 1);
    return touchedKeys;
  }

  const range = sheetChangeRangeToZeroBased(operation);
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      clearCell(r, c);
    }
  }
  return touchedKeys;
}

export const clearCells = {
  description: "清空单元格内容。使用 operations 数组，cell 用于清空离散单格，range 用于清空连续区域。行号和列号都从 1 开始；如果要写入内容，请使用 writeCells。",
  inputSchema: clearCellsInputSchema,
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
