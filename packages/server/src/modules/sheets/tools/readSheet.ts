import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import type { DocumentCell } from "@openexcel/core";
import * as documentService from "../../documents/service.js";
import { isMergeObject, readToolRange } from "../../documents/toolAdapter.js";

const DEFAULT_PAGE_SIZE = 30;

export interface SparseCell {
  row: number;
  col: number;
  value: string;
}

function inferColumnTypes(
  cells: DocumentCell[],
  startCol: number,
  endCol: number,
  hasHeader: boolean,
): string[] {
  const types = Array.from({ length: endCol - startCol + 1 }, () => "string");
  for (let col = startCol; col <= endCol; col += 1) {
    const values = cells
      .filter((cell) => cell.col === col && (!hasHeader || cell.row > 0))
      .map((cell) => cell.value.value)
      .filter((value) => value !== null && value !== "");
    if (values.length === 0) continue;
    const numeric = values.filter((value) => typeof value === "number").length;
    if (numeric > values.length / 2) types[col - startCol] = "number";
  }
  return types;
}

function computeColumnStats(
  cells: DocumentCell[],
  startCol: number,
  endCol: number,
  hasHeader: boolean,
): Record<string, { min: number; max: number; avg: number; count: number }> {
  const stats: Record<string, { min: number; max: number; avg: number; count: number }> = {};
  for (let col = startCol; col <= endCol; col += 1) {
    const values = cells
      .filter((cell) => cell.col === col && (!hasHeader || cell.row > 0))
      .map((cell) => cell.value.value)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) continue;
    stats[String(col + 1)] = {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
      count: values.length,
    };
  }
  return stats;
}

export const readSheet = {
  ...excelToolSpecs.readSheet,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    {
      sheetId,
      startRow,
      endRow,
      startCol,
      endCol,
    }: {
      sheetId: number;
      startRow?: number;
      endRow?: number;
      startCol?: number;
      endCol?: number;
    },
    { context }: { context: { workspaceId: number } },
  ) => {
    const sheet = await documentService.getSheetInfo(context.workspaceId, sheetId);
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

    const sr1 = Math.max(startRow ?? 1, 1);
    const sc1 = Math.max(startCol ?? 1, 1);
    const ec1 = Math.max(endCol ?? sheet.maxColumn, sc1);
    const hasHeader = sheet.maxRow > 1 && sheet.maxColumn > 0;
    const dataRowCount = sheet.maxRow;
    const er1 = Math.min(endRow ?? sr1 + DEFAULT_PAGE_SIZE - 1, Math.max(dataRowCount, sr1));
    const rangeStartRow = hasHeader && sr1 === 1 ? 0 : sr1 - 1 + (hasHeader ? 1 : 0);
    const rangeEndRow = er1 - 1 + (hasHeader ? 1 : 0);
    const range = {
      startRow: rangeStartRow,
      endRow: rangeEndRow,
      startCol: sc1 - 1,
      endCol: ec1 - 1,
    };
    const document = await readToolRange(context.workspaceId, sheetId, range);
    const data: SparseCell[] = document.cells
      .map((cell) => ({
        row: cell.row + 1 - (hasHeader ? 1 : 0),
        col: cell.col + 1,
        value: cell.value.displayValue ?? String(cell.value.value ?? ""),
      }))
      .filter((cell) => !hasHeader || cell.row > 0);
    const headerCells = document.cells.filter((cell) => cell.row === 0);
    const headers = Array.from({ length: ec1 - sc1 + 1 }, (_, index) => {
      const cell = headerCells.find((candidate) => candidate.col === sc1 - 1 + index);
      return cell?.value.displayValue ?? String(cell?.value.value ?? "");
    });
    const columnTypes = inferColumnTypes(document.cells, range.startCol, range.endCol, hasHeader);
    const columnStats = computeColumnStats(document.cells, range.startCol, range.endCol, hasHeader);
    const merges = document.objects
      .filter(isMergeObject)
      .map((object) => object.position)
      .filter(
        (position): position is Record<string, number> =>
          typeof position.startRow === "number" &&
          typeof position.startCol === "number" &&
          typeof position.endRow === "number" &&
          typeof position.endCol === "number",
      )
      .map((position) => ({
        startRow: position.startRow + 1 - (hasHeader ? 1 : 0),
        startCol: position.startCol + 1,
        endRow: position.endRow + 1 - (hasHeader ? 1 : 0),
        endCol: position.endCol + 1,
      }))
      .filter(
        (merge) =>
          merge.startRow <= er1 &&
          merge.endRow >= sr1 &&
          merge.startCol <= ec1 &&
          merge.endCol >= sc1,
      );
    const hasMoreRows = er1 < dataRowCount;
    const hasMoreCols = ec1 < sheet.maxColumn;
    const hintParts: string[] = [];
    if (hasMoreRows)
      hintParts.push(`还有${dataRowCount - er1}行未读取（可用 startRow=${er1 + 1} 继续读取）`);
    if (hasMoreCols)
      hintParts.push(`还有${sheet.maxColumn - ec1}列未读取（可用 startCol=${ec1 + 1} 继续读取）`);
    if (!hasMoreRows && !hasMoreCols) hintParts.push("已读取全部数据");

    return {
      sheetInfo: { sheetNo: sheet.sheetNo, sheetName: sheet.name },
      sheetName: sheet.name,
      sheetNo: sheet.sheetNo,
      totalRowCount: dataRowCount,
      totalColumnCount: sheet.maxColumn,
      hasFirstRowAsHeader: hasHeader,
      headers,
      columnTypes,
      columnStats,
      startRow: sr1,
      endRow: er1,
      startCol: sc1,
      endCol: ec1,
      data,
      merges,
      hasMoreRows,
      hasMoreCols,
      hasMoreRowsAbove: sr1 > 1,
      hint: hintParts.join("；"),
    };
  },
};
