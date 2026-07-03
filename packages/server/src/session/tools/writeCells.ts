import { excelToolSpecs, sheetMutationContextSchema } from "@openexcel/agent";
import { prisma } from "../../db.js";
import {
  sheetChangeCellToZeroBased,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  type SheetChangeDelta,
  type SheetChangeCell,
} from "@openexcel/core";
import { buildSheetChangePreview } from "./preview.js";
import * as repo from "../repository.js";
import { sheetRecordToCelldata } from "../../utils/sheetData.js";
type WriteCellsInput = {
  sheetId: number;
  operations: Array<
    | { type: "cell"; row: number; col: number; value: string }
    | { type: "range"; startRow: number; startCol: number; endRow: number; endCol: number; value: string }
  >;
};

function normalizeWriteOperations(input: WriteCellsInput): { sheetId: number; operations: Array<
  | { type: "cell"; row: number; col: number; value: string }
  | { type: "range"; startRow: number; startCol: number; endRow: number; endCol: number; value: string }
> } {
  return {
    sheetId: input.sheetId,
    operations: input.operations.map((operation) => (
      operation.type === "cell"
        ? { type: "cell", row: operation.row, col: operation.col, value: operation.value }
        : {
            type: "range",
            startRow: operation.startRow,
            startCol: operation.startCol,
            endRow: operation.endRow,
            endCol: operation.endCol,
            value: operation.value,
          }
    )),
  };
}

function applyCellWrite(
  cellMap: Map<string, any>,
  touchedCells: Map<string, SheetChangeCell>,
  row0: number,
  col0: number,
  value: string,
) {
  const key = `${row0},${col0}`;
  if (cellMap.has(key)) {
    const existing = cellMap.get(key);
    existing.v = { ...existing.v, v: value, m: String(value) };
  } else {
    const newCell = { r: row0, c: col0, v: { v: value, m: String(value) } };
    cellMap.set(key, newCell);
  }

  touchedCells.set(key, {
    row: row0 + 1,
    col: col0 + 1,
    value,
  });
}

export const writeCells = {
  ...excelToolSpecs.writeCells,
  contextSchema: sheetMutationContextSchema,
  execute: async (
    input: WriteCellsInput,
    { context }: { context: { runId: number } },
  ) => {
    const { sheetId, operations } = normalizeWriteOperations(input);
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

    const touchedCells = new Map<string, SheetChangeCell>();
    for (const operation of operations) {
      if (operation.type === "cell") {
        const storageCell = sheetChangeCellToZeroBased(operation);
        applyCellWrite(cellMap, touchedCells, storageCell.row, storageCell.col, storageCell.value);
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
          applyCellWrite(cellMap, touchedCells, row, col, operation.value);
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
      sheetInfo: { sheetId: sheet.id, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
