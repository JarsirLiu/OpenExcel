import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import { type SheetChangeDelta, sheetChangePatchOutputSchema } from "@openexcel/core";
import {
  applyToolOperations,
  buildToolPreview,
  mergeRanges,
  rangeForWriteOperation,
  readToolRange,
  type ToolWriteOperation,
  writeOperationToDocument,
} from "../../documents/toolAdapter.js";
import { normalizeWriteOperations, type WriteCellsInput } from "../domain.js";

function normalizeFormula(formula?: string): string | undefined {
  if (!formula) return undefined;
  const value = formula.trim();
  if (!value) return undefined;
  return value.startsWith("=") ? value.slice(1) : value;
}

function touchedCells(operations: ToolWriteOperation[]) {
  const cells: Array<{
    row: number;
    col: number;
    value: string | number | boolean;
    formula?: string;
  }> = [];
  for (const operation of operations) {
    const formula = normalizeFormula(operation.formula);
    if (operation.type === "cell") {
      cells.push({
        row: operation.row,
        col: operation.col,
        value: operation.value,
        ...(formula ? { formula } : {}),
      });
      continue;
    }
    for (let row = operation.startRow; row <= operation.endRow; row += 1) {
      for (let col = operation.startCol; col <= operation.endCol; col += 1) {
        cells.push({
          row,
          col,
          value: operation.value,
          ...(formula ? { formula } : {}),
        });
      }
    }
  }
  return cells;
}

export const writeCells = {
  ...excelToolSpecs.writeCells,
  contextSchema: runToolContextSchema,
  execute: async (
    input: WriteCellsInput,
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const { sheetId, operations } = normalizeWriteOperations(input);
    const documentOperations = operations.map(writeOperationToDocument);
    const ranges = operations.map(rangeForWriteOperation);
    const { sheet } = await applyToolOperations(
      context.workspaceId,
      sheetId,
      documentOperations,
      context.runId,
    );
    const previewRange = mergeRanges(ranges);
    const previewData = await readToolRange(context.workspaceId, sheetId, previewRange);
    const touched = touchedCells(operations);
    const delta: SheetChangeDelta = { type: "write", cells: touched };
    const output = {
      success: true,
      updatedCells: touched.length,
      delta,
      preview: buildToolPreview(sheet, previewRange, previewData.cells),
      sheetInfo: { sheetId: sheet.sheetId, sheetNo: sheet.sheetNo, sheetName: sheet.name },
    };

    sheetChangePatchOutputSchema.parse(output);
    return output;
  },
};
