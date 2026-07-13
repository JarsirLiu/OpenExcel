import { type CellRange, cellRangeSize } from "@openexcel/core";
import type { DocumentSheetInfo } from "./repository.js";
import { isMergeObject } from "./toolDocumentOperations.js";

export function buildToolPreview(
  sheet: Pick<DocumentSheetInfo, "sheetId" | "name">,
  range: CellRange,
  cells: Array<{ row: number; col: number; value: { value: unknown; displayValue?: string } }>,
  objects: Array<{
    type: string;
    position: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [],
) {
  const { rows, cols } = cellRangeSize(range);
  const values = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  for (const cell of cells) {
    const row = cell.row - range.startRow;
    const col = cell.col - range.startCol;
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    values[row][col] = cell.value.displayValue ?? String(cell.value.value ?? "");
  }
  const merges = objects
    .filter(isMergeObject)
    .map((object) => object.position)
    .filter(
      (position): position is Record<string, number> =>
        typeof position.startRow === "number" &&
        typeof position.startCol === "number" &&
        typeof position.endRow === "number" &&
        typeof position.endCol === "number",
    )
    .filter(
      (position) =>
        position.startRow <= range.endRow &&
        position.endRow >= range.startRow &&
        position.startCol <= range.endCol &&
        position.endCol >= range.startCol,
    )
    .map((position) => ({
      startRow: position.startRow + 1,
      startCol: position.startCol + 1,
      endRow: position.endRow + 1,
      endCol: position.endCol + 1,
    }));
  return {
    sheetId: sheet.sheetId,
    sheetName: sheet.name,
    range: {
      startRow: range.startRow + 1,
      endRow: range.endRow + 1,
      startCol: range.startCol + 1,
      endCol: range.endCol + 1,
    },
    rows: values,
    merges,
  };
}
