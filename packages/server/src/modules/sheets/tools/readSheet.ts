import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import type { FortuneCell } from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import { parseMergesFromCelldata } from "../domain/sheet.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

const DEFAULT_PAGE_SIZE = 30;
const MAX_CELLS_PER_READ = 4_000;
const MAX_OVERVIEW_COLUMNS = 200;
const MAX_SAMPLE_ROWS = 24;
const MAX_OVERVIEW_SAMPLE_CELLS = 800;
const MAX_SAMPLE_VALUE_LENGTH = 160;

export interface SparseCell {
  row: number;
  col: number;
  value: string;
}

export interface ColumnProfile {
  index: number;
  name: string;
  type: "string" | "number";
  nonEmpty: number;
  empty: number;
  sampleValues: string[];
  min?: number;
  max?: number;
  avg?: number;
}

function getColumnCount(celldata: FortuneCell[]): number {
  if (celldata.length === 0) return 0;
  let maxColumn = 0;
  for (const cell of celldata) {
    maxColumn = Math.max(maxColumn, cell.c);
  }
  return maxColumn + 1;
}

function detectHeader(celldata: FortuneCell[]): boolean {
  let hasRow0 = false;
  let hasRow1 = false;
  for (const cell of celldata) {
    if (cell.r === 0) hasRow0 = true;
    if (cell.r === 1) hasRow1 = true;
    if (hasRow0 && hasRow1) return true;
  }
  return false;
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
  let maxRow = 0;
  for (const cell of celldata) {
    maxRow = Math.max(maxRow, cell.r);
  }
  if (hasHeader) return maxRow;
  return maxRow + 1;
}

function buildColumnAnalysis(
  celldata: FortuneCell[],
  columnCount: number,
  headers: string[],
  hasHeader: boolean,
  dataRowCount: number,
): {
  columnTypes: string[];
  columnStats: Record<string, { min: number; max: number; avg: number; count: number }>;
  columnProfiles: ColumnProfile[];
} {
  const states = Array.from({ length: columnCount }, () => ({
    nonEmpty: 0,
    numeric: 0,
    nonNumeric: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    sampleValues: [] as string[],
  }));

  for (const cell of celldata) {
    if (hasHeader && cell.r === 0) continue;
    const state = states[cell.c];
    if (!state) continue;
    const value = String(cell.v?.v ?? "");
    if (value === "") {
      continue;
    }

    state.nonEmpty += 1;
    if (state.sampleValues.length < 3 && !state.sampleValues.includes(value)) {
      state.sampleValues.push(value.slice(0, MAX_SAMPLE_VALUE_LENGTH));
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      state.nonNumeric += 1;
    } else {
      state.numeric += 1;
      state.sum += numericValue;
      state.min = Math.min(state.min, numericValue);
      state.max = Math.max(state.max, numericValue);
    }
  }

  const columnTypes = states.map((state) =>
    state.numeric > state.nonNumeric ? "number" : "string",
  );
  const columnStats: Record<string, { min: number; max: number; avg: number; count: number }> = {};
  const columnProfiles: ColumnProfile[] = states.map((state, index) => {
    const empty = Math.max(0, dataRowCount - state.nonEmpty);
    const type = columnTypes[index] as "string" | "number";
    const profile: ColumnProfile = {
      index: index + 1,
      name: headers[index] || `Column ${index + 1}`,
      type,
      nonEmpty: state.nonEmpty,
      empty,
      sampleValues: state.sampleValues,
    };

    if (state.numeric > 0) {
      const stats = {
        min: state.min,
        max: state.max,
        avg: Math.round((state.sum / state.numeric) * 100) / 100,
        count: state.numeric,
      };
      columnStats[String(index + 1)] = stats;
      profile.min = stats.min;
      profile.max = stats.max;
      profile.avg = stats.avg;
    }

    return profile;
  });

  return { columnTypes, columnStats, columnProfiles };
}

function getSampleRowNumbers(rowCount: number): number[] {
  if (rowCount <= 0) return [];
  const headCount = Math.min(8, rowCount);
  const tailCount = Math.min(8, Math.max(0, rowCount - headCount));
  const rows = new Set<number>();

  for (let row = 1; row <= headCount; row += 1) rows.add(row);
  for (let row = rowCount - tailCount + 1; row <= rowCount; row += 1) {
    if (row >= 1) rows.add(row);
  }

  for (const ratio of [0.25, 0.5, 0.75]) {
    rows.add(Math.max(1, Math.min(rowCount, Math.round(rowCount * ratio))));
  }

  return [...rows].sort((a, b) => a - b).slice(0, MAX_SAMPLE_ROWS);
}

function buildSampleRows(
  celldata: FortuneCell[],
  sampleRows: number[],
  columnCount: number,
  headerOffset: number,
): Array<{ row: number; values: string[] }> {
  const sampleColumnCount = Math.min(
    columnCount,
    MAX_OVERVIEW_COLUMNS,
    Math.max(1, Math.floor(MAX_OVERVIEW_SAMPLE_CELLS / Math.max(1, sampleRows.length))),
  );
  const rowSet = new Set(sampleRows.map((row) => row - 1 + headerOffset));
  const valuesByRow = new Map<number, string[]>();

  for (const cell of celldata) {
    if (!rowSet.has(cell.r) || cell.c >= sampleColumnCount) continue;
    const values = valuesByRow.get(cell.r) ?? Array(sampleColumnCount).fill("");
    values[cell.c] = String(cell.v?.v ?? "").slice(0, MAX_SAMPLE_VALUE_LENGTH);
    valuesByRow.set(cell.r, values);
  }

  return sampleRows.map((row) => ({
    row,
    values: valuesByRow.get(row - 1 + headerOffset) ?? Array(sampleColumnCount).fill(""),
  }));
}

function filterCelldataByRange(
  celldata: FortuneCell[],
  startRow0: number,
  endRow0: number,
  startCol0: number,
  endCol0: number,
): FortuneCell[] {
  return celldata.filter(
    (c) => c.r >= startRow0 && c.r <= endRow0 && c.c >= startCol0 && c.c <= endCol0,
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

function limitRangeToCellBudget(
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): { endRow: number; endCol: number } {
  const rowCount = Math.max(1, endRow - startRow + 1);
  const colCount = Math.max(1, endCol - startCol + 1);
  if (rowCount * colCount <= MAX_CELLS_PER_READ) {
    return { endRow, endCol };
  }

  const limitedRowCount = Math.max(1, Math.floor(MAX_CELLS_PER_READ / colCount));
  const limitedEndRow = Math.min(endRow, startRow + limitedRowCount - 1);
  const actualRowCount = Math.max(1, limitedEndRow - startRow + 1);
  const limitedColCount = Math.max(1, Math.floor(MAX_CELLS_PER_READ / actualRowCount));
  return {
    endRow: limitedEndRow,
    endCol: Math.min(endCol, startCol + limitedColCount - 1),
  };
}

export const readSheet = {
  ...excelToolSpecs.readSheet,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    {
      sheetId,
      mode,
      startRow,
      endRow,
      startCol,
      endCol,
      includeMetadata,
    }: {
      sheetId: number;
      mode?: "overview" | "range";
      startRow?: number;
      endRow?: number;
      startCol?: number;
      endCol?: number;
      includeMetadata?: boolean;
    },
    { context }: { context: { workspaceId: number } },
  ) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);
    if (sheet.workbook.workspaceId !== context.workspaceId) {
      throw new Error(`Sheet ${sheetId} 不存在`);
    }

    const celldata: FortuneCell[] = sheetRecordToCelldata(sheet);
    const columnCount = getColumnCount(celldata);
    const hasHeader = detectHeader(celldata);
    const dataRowCount = getDataRowCount(celldata, hasHeader);
    const headers = getHeaders(celldata, columnCount);
    const { columnTypes, columnStats, columnProfiles } = buildColumnAnalysis(
      celldata,
      columnCount,
      headers,
      hasHeader,
      dataRowCount,
    );

    const hasExplicitRange =
      startRow != null || endRow != null || startCol != null || endCol != null;
    const isOverview = mode === "overview" || (mode !== "range" && !hasExplicitRange);
    const sampleRows = getSampleRowNumbers(dataRowCount);
    const headerOffset = hasHeader ? 1 : 0;
    const overviewColumnCount = Math.min(columnCount, MAX_OVERVIEW_COLUMNS);
    const sampleColumnCount = Math.min(
      columnCount,
      overviewColumnCount,
      Math.max(1, Math.floor(MAX_OVERVIEW_SAMPLE_CELLS / Math.max(1, sampleRows.length))),
    );

    if (isOverview) {
      const overviewHeaders = headers.slice(0, overviewColumnCount);
      const overviewTypes = columnTypes.slice(0, overviewColumnCount);
      const overviewStats = Object.fromEntries(
        Object.entries(columnStats).filter(([column]) => Number(column) <= overviewColumnCount),
      );
      const hintParts = [
        "这是整张 Sheet 的概览和代表性抽样，不是完整明细",
        "如需具体数据，请使用 mode=range 指定行列范围",
      ];
      if (columnCount > overviewColumnCount) {
        hintParts.push(`概览只展示前${overviewColumnCount}列，请用 mode=range 查看其余列`);
      }

      return {
        mode: "overview" as const,
        sheetInfo: { sheetNo: sheet.sheetNo, sheetName: sheet.name },
        sheetName: sheet.name,
        sheetNo: sheet.sheetNo,
        totalRowCount: dataRowCount,
        totalColumnCount: columnCount,
        hasFirstRowAsHeader: hasHeader,
        headers: overviewHeaders,
        columnTypes: overviewTypes,
        columnStats: overviewStats,
        columnProfiles: columnProfiles.slice(0, overviewColumnCount),
        sampleRows: buildSampleRows(celldata, sampleRows, sampleColumnCount, headerOffset),
        sampleRowCount: sampleRows.length,
        sampleColumnCount,
        sampled: true,
        metadataIncluded: true,
        data: [],
        merges: [],
        hasMoreRows: false,
        hasMoreCols: columnCount > overviewColumnCount,
        hasMoreRowsAbove: false,
        hint: hintParts.join("；"),
      };
    }

    const mergesFull = parseMergesFromCelldata(celldata);

    const maxCol1 = columnCount;

    const sr1 = startRow ?? 1;
    const er1 = endRow ?? Math.min(sr1 + DEFAULT_PAGE_SIZE - 1, dataRowCount);
    const sc1 = startCol ?? 1;
    const ec1 = endCol ?? maxCol1;
    const limitedRange = limitRangeToCellBudget(sr1, er1, sc1, ec1);
    const limitedEr1 = limitedRange.endRow;
    const limitedEc1 = limitedRange.endCol;

    const sr0 = sr1 - 1 + headerOffset;
    const er0 = limitedEr1 - 1 + headerOffset;
    const sc0 = sc1 - 1;
    const ec0 = limitedEc1 - 1;

    const filteredCelldata = filterCelldataByRange(celldata, sr0, er0, sc0, ec0);
    const mergesNormalized = hasHeader
      ? mergesFull.map((m) => ({
          ...m,
          startRow: m.startRow - 1,
          endRow: m.endRow - 1,
        }))
      : mergesFull;
    const slicedMerges = filterMergesByRange(mergesNormalized, sr1, limitedEr1, sc1, limitedEc1);

    const data: SparseCell[] = filteredCelldata.map((c) => ({
      row: c.r + 1 - headerOffset,
      col: c.c + 1,
      value: String(c.v?.v ?? ""),
    }));

    const hasMoreRows = limitedEr1 < dataRowCount;
    const hasMoreCols = limitedEc1 < maxCol1;
    const hasMoreRowsAbove = sr1 > 1;
    const wasLimitedByCellBudget = limitedEr1 < er1 || limitedEc1 < ec1;

    const sheetInfo = {
      sheetNo: sheet.sheetNo,
      sheetName: sheet.name,
    };

    const hintParts: string[] = [];
    if (hasMoreRows) {
      hintParts.push(
        `还有${dataRowCount - limitedEr1}行未读取（可用 startRow=${limitedEr1 + 1} 继续读取）`,
      );
    }
    if (hasMoreCols) {
      hintParts.push(
        `还有${maxCol1 - limitedEc1}列未读取（可用 startCol=${limitedEc1 + 1} 继续读取）`,
      );
    }
    if (wasLimitedByCellBudget) {
      hintParts.push(`本次读取受单次${MAX_CELLS_PER_READ}个单元格上限限制`);
    }
    if (!hasMoreRows && !hasMoreCols) {
      hintParts.push("已读取全部数据");
    }

    return {
      mode: "range" as const,
      sheetInfo,
      sheetName: sheet.name,
      sheetNo: sheet.sheetNo,
      totalRowCount: dataRowCount,
      totalColumnCount: columnCount,
      hasFirstRowAsHeader: hasHeader,
      headers: includeMetadata ? headers : [],
      columnTypes: includeMetadata ? columnTypes : [],
      columnStats: includeMetadata ? columnStats : {},
      columnProfiles: includeMetadata ? columnProfiles : [],
      sampleRows: [],
      sampleRowCount: 0,
      sampleColumnCount: 0,
      sampled: false,
      metadataIncluded: Boolean(includeMetadata),
      startRow: sr1,
      endRow: limitedEr1,
      startCol: sc1,
      endCol: limitedEc1,
      data,
      merges: slicedMerges,
      hasMoreRows,
      hasMoreCols,
      hasMoreRowsAbove,
      hint: hintParts.join("；"),
    };
  },
};
