import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";
import { parseMergesFromCelldata } from "../domain.js";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import type { FortuneCell } from "@openexcel/core";

const DEFAULT_PAGE_SIZE = 30;

interface SparseCell {
  row: number;
  col: number;
  value: string;
}

function getColumnCount(celldata: FortuneCell[]): number {
  if (celldata.length === 0) return 0;
  return Math.max(...celldata.map((c) => c.c), 0) + 1;
}

function detectHeader(celldata: FortuneCell[]): boolean {
  const row0Cells = celldata.filter((c) => c.r === 0);
  const row1Cells = celldata.filter((c) => c.r === 1);
  return row0Cells.length > 0 && row1Cells.length > 0;
}

function getHeaders(celldata: FortuneCell[], columnCount: number): string[] {
  const headers = Array(columnCount).fill("");
  for (const cell of celldata) {
    if (cell.r === 0 && cell.c < columnCount) {
      headers[cell.c] = String(cell.v?.v ?? "");
    }
  }
  return headers;
}

function getDataRowCount(celldata: FortuneCell[], hasHeader: boolean): number {
  if (celldata.length === 0) return 0;
  const maxRow = Math.max(...celldata.map((c) => c.r), 0);
  if (hasHeader) return maxRow;
  return maxRow + 1;
}

function inferColumnTypes(
  celldata: FortuneCell[],
  columnCount: number,
  hasHeader: boolean,
): string[] {
  const types = Array(columnCount).fill("string");
  for (let col = 0; col < columnCount; col++) {
    const cells = celldata.filter((c) => c.c === col && (!hasHeader || c.r > 0));
    let numeric = 0;
    let str = 0;
    for (const cell of cells) {
      const v = String(cell.v?.v ?? "");
      if (v === "") continue;
      if (!isNaN(Number(v))) numeric++;
      else str++;
    }
    if (numeric > str) types[col] = "number";
  }
  return types;
}

function computeColumnStats(
  celldata: FortuneCell[],
  columnCount: number,
  columnTypes: string[],
  hasHeader: boolean,
): Record<string, { min: number; max: number; avg: number; count: number }> {
  const stats: Record<string, { min: number; max: number; avg: number; count: number }> = {};
  for (let col = 0; col < columnCount; col++) {
    if (columnTypes[col] !== "number") continue;
    const cells = celldata.filter((c) => c.c === col && (!hasHeader || c.r > 0));
    const nums = cells.map((c) => Number(c.v?.v)).filter((n) => !isNaN(n));
    if (nums.length === 0) continue;
    const key = String(col + 1);
    stats[key] = {
      min: Math.min(...nums),
      max: Math.max(...nums),
      avg: Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100,
      count: nums.length,
    };
  }
  return stats;
}

function filterCelldataByRange(
  celldata: FortuneCell[],
  startRow0: number,
  endRow0: number,
  startCol0: number,
  endCol0: number,
): FortuneCell[] {
  return celldata.filter(
    (c) =>
      c.r >= startRow0 &&
      c.r <= endRow0 &&
      c.c >= startCol0 &&
      c.c <= endCol0,
  );
}

function filterMergesByRange(
  merges: { startRow: number; startCol: number; endRow: number; endCol: number }[],
  startRow1: number,
  endRow1: number,
  startCol1: number,
  endCol1: number,
): { startRow: number; startCol: number; endRow: number; endCol: number }[] {
  return merges.filter(
    (m) =>
      m.startRow <= endRow1 &&
      m.endRow >= startRow1 &&
      m.startCol <= endCol1 &&
      m.endCol >= startCol1,
  );
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
    const sheet = await prisma.sheet.findFirst({
      where: { id: sheetId },
      include: { workbook: true },
    });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);
    if (sheet.workbook.workspaceId !== context.workspaceId) {
      throw new Error(`Sheet ${sheetId} 不存在`);
    }

    const celldata: FortuneCell[] = sheetRecordToCelldata(sheet);
    const columnCount = getColumnCount(celldata);
    const hasHeader = detectHeader(celldata);
    const dataRowCount = getDataRowCount(celldata, hasHeader);
    const headers = getHeaders(celldata, columnCount);
    const columnTypes = inferColumnTypes(celldata, columnCount, hasHeader);
    const columnStats = computeColumnStats(celldata, columnCount, columnTypes, hasHeader);
    const mergesFull = parseMergesFromCelldata(celldata);

    const maxCol1 = columnCount;

    const headerOffset = hasHeader ? 1 : 0;

    const sr1 = startRow ?? 1;
    const er1 = endRow ?? Math.min(sr1 + DEFAULT_PAGE_SIZE - 1, dataRowCount);
    const sc1 = startCol ?? 1;
    const ec1 = endCol ?? maxCol1;

    const sr0 = sr1 - 1 + headerOffset;
    const er0 = er1 - 1 + headerOffset;
    const sc0 = sc1 - 1;
    const ec0 = ec1 - 1;

    const filteredCelldata = filterCelldataByRange(celldata, sr0, er0, sc0, ec0);
    const mergesNormalized = hasHeader
      ? mergesFull.map((m) => ({
          ...m,
          startRow: m.startRow - 1,
          endRow: m.endRow - 1,
        }))
      : mergesFull;
    const slicedMerges = filterMergesByRange(mergesNormalized, sr1, er1, sc1, ec1);

    const data: SparseCell[] = filteredCelldata.map((c) => ({
      row: c.r + 1 - headerOffset,
      col: c.c + 1,
      value: String(c.v?.v ?? ""),
    }));

    const hasMoreRows = er1 < dataRowCount;
    const hasMoreCols = ec1 < maxCol1;
    const hasMoreRowsAbove = sr1 > 1;

    const sheetInfo = {
      sheetNo: sheet.sheetNo,
      sheetName: sheet.name,
    };

    const hintParts: string[] = [];
    if (hasMoreRows) {
      hintParts.push(`还有${dataRowCount - er1}行未读取（可用 startRow=${er1 + 1} 继续读取）`);
    }
    if (hasMoreCols) {
      hintParts.push(`还有${maxCol1 - ec1}列未读取（可用 startCol=${ec1 + 1} 继续读取）`);
    }
    if (!hasMoreRows && !hasMoreCols) {
      hintParts.push("已读取全部数据");
    }

    return {
      sheetInfo,
      sheetName: sheet.name,
      sheetNo: sheet.sheetNo,
      totalRowCount: dataRowCount,
      totalColumnCount: columnCount,
      hasFirstRowAsHeader: hasHeader,
      headers,
      columnTypes,
      columnStats,
      startRow: sr1,
      endRow: er1,
      startCol: sc1,
      endCol: ec1,
      data,
      merges: slicedMerges,
      hasMoreRows,
      hasMoreCols,
      hasMoreRowsAbove,
      hint: hintParts.join("；"),
    };
  },
};