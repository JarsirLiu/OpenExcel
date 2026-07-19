import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import {
  type SheetChangeDelta,
  sheetChangeCellToZeroBased,
  sheetChangePatchOutputSchema,
  sheetChangeRangeToZeroBased,
  storageIndex,
  type ToolIndex,
  toolIndexToStorage,
} from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import {
  applyCellWrite,
  buildSheetChangePreview,
  cellContentEqual,
  normalizeWriteOperations,
  snapshotCellContent,
  type WriteCellsInput,
} from "../domain/sheet.js";
import * as sheetRepo from "../infrastructure/sheetRepository.js";
import { runSheetMutation } from "./runSheetMutation.js";

export const writeCells = {
  ...excelToolSpecs.writeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    input: WriteCellsInput,
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const { sheetId, operations } = normalizeWriteOperations(input);
    return runSheetMutation(context, sheetId, async (sheet) => {
      const celldata: any[] = sheetRecordToCelldata(sheet);
      if (!Array.isArray(celldata)) throw new Error("celldata 格式错误");

      const cellMap = new Map<string, any>();
      const initialContent = new Map<string, ReturnType<typeof snapshotCellContent>>();
      for (const cell of celldata) {
        cellMap.set(`${cell.r},${cell.c}`, cell);
        initialContent.set(`${cell.r},${cell.c}`, snapshotCellContent(cell));
      }

      const touchedCells = new Map<
        string,
        { row: ToolIndex; col: ToolIndex; value: string | number | boolean; formula?: string }
      >();
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

        for (
          let row = storageRange.startRow;
          row <= storageRange.endRow;
          row = storageIndex(row + 1)
        ) {
          for (
            let col = storageRange.startCol;
            col <= storageRange.endCol;
            col = storageIndex(col + 1)
          ) {
            applyCellWrite(cellMap, touchedCells, row, col, operation.value, operation.formula);
          }
        }
      }

      const updatedCelldata = Array.from(cellMap.values());

      await sheetRepo.updateSheetContent(
        sheetId,
        JSON.stringify(updatedCelldata),
        context.workspaceId,
      );

      const touchedValues = Array.from(touchedCells.values());
      const changedValues = Array.from(touchedCells.entries())
        .filter(([key]) => {
          const cell = cellMap.get(key);
          return !cellContentEqual(initialContent.get(key), snapshotCellContent(cell));
        })
        .map(([, cell]) => cell);
      const minRow = storageIndex(
        Math.min(...touchedValues.map((cell) => toolIndexToStorage(cell.row))),
      );
      const maxRow = storageIndex(
        Math.max(...touchedValues.map((cell) => toolIndexToStorage(cell.row))),
      );

      const delta: SheetChangeDelta = {
        type: "write",
        cells: changedValues,
      };

      const output = {
        success: true,
        updatedCells: changedValues.length,
        changeSummary: {
          changedCellCount: changedValues.length,
          rangeOperationCount: 0,
        },
        delta,
        preview: buildSheetChangePreview(updatedCelldata, sheet.name, sheetId, minRow, maxRow),
        sheetInfo: { sheetId: sheet.id, sheetNo: sheet.sheetNo, sheetName: sheet.name },
      };

      sheetChangePatchOutputSchema.parse(output);
      return output;
    });
  },
};
