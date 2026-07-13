import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import type { DocumentCell } from "@openexcel/core";
import * as documentService from "../../documents/service.js";
import { isMergeObject, readToolRange } from "../../documents/toolAdapter.js";

const DEFAULT_PAGE_SIZE = 30;
const MAX_CELLS_PER_READ = 4_000;
const MAX_ANALYSIS_CELLS = 100_000;
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

type ColumnStats = Record<string, { min: number; max: number; avg: number; count: number }>;

function cellText(cell: DocumentCell): string {
  return cell.value.displayValue ?? String(cell.value.value ?? "");
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

  return [...rows].sort((left, right) => left - right).slice(0, MAX_SAMPLE_ROWS);
}

function limitRangeToCellBudget(
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): { endRow: number; endCol: number } {
  const rowCount = Math.max(1, endRow - startRow + 1);
  const colCount = Math.max(1, endCol - startCol + 1);
  if (rowCount * colCount <= MAX_CELLS_PER_READ) return { endRow, endCol };

  const limitedRowCount = Math.max(1, Math.floor(MAX_CELLS_PER_READ / colCount));
  const limitedEndRow = Math.min(endRow, startRow + limitedRowCount - 1);
  const actualRowCount = Math.max(1, limitedEndRow - startRow + 1);
  const limitedColCount = Math.max(1, Math.floor(MAX_CELLS_PER_READ / actualRowCount));
  return {
    endRow: limitedEndRow,
    endCol: Math.min(endCol, startCol + limitedColCount - 1),
  };
}

function buildColumnAnalysis(
  cells: DocumentCell[],
  columnCount: number,
  headers: string[],
  hasHeader: boolean,
  dataRowCount: number,
): { columnTypes: string[]; columnStats: ColumnStats; columnProfiles: ColumnProfile[] } {
  const states = Array.from({ length: columnCount }, () => ({
    nonEmpty: 0,
    numeric: 0,
    nonNumeric: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    sampleValues: [] as string[],
  }));

  for (const cell of cells) {
    if (hasHeader && cell.row === 0) continue;
    const state = states[cell.col];
    if (!state) continue;
    const value = cellText(cell);
    if (value === "") continue;

    state.nonEmpty += 1;
    if (state.sampleValues.length < 3 && !state.sampleValues.includes(value)) {
      state.sampleValues.push(value.slice(0, MAX_SAMPLE_VALUE_LENGTH));
    }

    const numericValue = Number(cell.value.value);
    if (typeof cell.value.value !== "number" || Number.isNaN(numericValue)) {
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
  const columnStats: ColumnStats = {};
  const columnProfiles: ColumnProfile[] = states.map((state, index) => {
    const profile: ColumnProfile = {
      index: index + 1,
      name: headers[index] || `Column ${index + 1}`,
      type: columnTypes[index] as "string" | "number",
      nonEmpty: state.nonEmpty,
      empty: Math.max(0, dataRowCount - state.nonEmpty),
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

function buildSampleRows(
  cells: DocumentCell[],
  sampleRows: number[],
  sampleColumnCount: number,
  headerOffset: number,
): Array<{ row: number; values: string[] }> {
  const rowSet = new Set(sampleRows.map((row) => row - 1 + headerOffset));
  const valuesByRow = new Map<number, string[]>();

  for (const cell of cells) {
    if (!rowSet.has(cell.row) || cell.col >= sampleColumnCount) continue;
    const values = valuesByRow.get(cell.row) ?? Array(sampleColumnCount).fill("");
    values[cell.col] = cellText(cell).slice(0, MAX_SAMPLE_VALUE_LENGTH);
    valuesByRow.set(cell.row, values);
  }

  return sampleRows.map((row) => ({
    row,
    values: valuesByRow.get(row - 1 + headerOffset) ?? Array(sampleColumnCount).fill(""),
  }));
}

function normalizeMerges(
  cells: DocumentCell[],
  objects: Array<{
    type: string;
    position: Record<string, unknown>;
    data: Record<string, unknown>;
  }>,
  hasHeader: boolean,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
) {
  void cells;
  return objects
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
        position.startRow <= endRow &&
        position.endRow >= startRow &&
        position.startCol <= endCol &&
        position.endCol >= startCol,
    )
    .map((position) => ({
      startRow: position.startRow + 1 - (hasHeader ? 1 : 0),
      startCol: position.startCol + 1,
      endRow: position.endRow + 1 - (hasHeader ? 1 : 0),
      endCol: position.endCol + 1,
    }));
}

async function readOverview(
  workspaceId: number,
  sheetId: number,
  sheet: { maxRow: number; maxColumn: number; sheetNo: number; name: string },
  hasHeader: boolean,
  dataRowCount: number,
) {
  const columnCount = Math.max(0, sheet.maxColumn);
  const headerOffset = hasHeader ? 1 : 0;
  const sampleRows = getSampleRowNumbers(dataRowCount);
  const overviewColumnCount = Math.min(columnCount, MAX_OVERVIEW_COLUMNS);
  const sampleColumnCount = Math.min(
    columnCount,
    overviewColumnCount,
    Math.max(1, Math.floor(MAX_OVERVIEW_SAMPLE_CELLS / Math.max(1, sampleRows.length))),
  );
  const analysisCells: DocumentCell[] = [];

  if (sheet.maxRow > 0 && columnCount > 0 && sheet.maxRow * columnCount <= MAX_ANALYSIS_CELLS) {
    const document = await readToolRange(workspaceId, sheetId, {
      startRow: 0,
      endRow: sheet.maxRow - 1,
      startCol: 0,
      endCol: columnCount - 1,
    });
    analysisCells.push(...document.cells);
  } else {
    if (hasHeader && sampleColumnCount > 0) {
      const header = await readToolRange(workspaceId, sheetId, {
        startRow: 0,
        endRow: 0,
        startCol: 0,
        endCol: overviewColumnCount - 1,
      });
      analysisCells.push(...header.cells);
    }
    for (const row of sampleRows) {
      if (sampleColumnCount === 0) break;
      const sample = await readToolRange(workspaceId, sheetId, {
        startRow: row - 1 + headerOffset,
        endRow: row - 1 + headerOffset,
        startCol: 0,
        endCol: sampleColumnCount - 1,
      });
      analysisCells.push(...sample.cells);
    }
  }

  const headers = Array.from({ length: overviewColumnCount }, (_, index) => {
    const cell = analysisCells.find((candidate) => candidate.row === 0 && candidate.col === index);
    return cell ? cellText(cell) : "";
  });
  const { columnTypes, columnStats, columnProfiles } = buildColumnAnalysis(
    analysisCells,
    overviewColumnCount,
    headers,
    hasHeader,
    dataRowCount,
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
    headers,
    columnTypes,
    columnStats,
    columnProfiles,
    sampleRows: buildSampleRows(analysisCells, sampleRows, sampleColumnCount, headerOffset),
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
    const sheet = await documentService.getSheetInfo(context.workspaceId, sheetId);
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

    const hasHeader = sheet.maxRow > 1 && sheet.maxColumn > 0;
    const headerOffset = hasHeader ? 1 : 0;
    const dataRowCount = Math.max(0, sheet.maxRow - headerOffset);
    const hasExplicitRange =
      startRow != null || startCol != null || endRow != null || endCol != null;
    const isOverview = mode === "overview" || (mode !== "range" && !hasExplicitRange);

    if (isOverview) {
      return readOverview(context.workspaceId, sheetId, sheet, hasHeader, dataRowCount);
    }

    const maxColumn = Math.max(0, sheet.maxColumn);
    const sr1 = Math.max(startRow ?? 1, 1);
    const er1 = Math.min(endRow ?? sr1 + DEFAULT_PAGE_SIZE - 1, Math.max(dataRowCount, sr1));
    const sc1 = Math.max(startCol ?? 1, 1);
    const ec1 = Math.max(endCol ?? maxColumn, sc1);
    const limitedRange = limitRangeToCellBudget(sr1, er1, sc1, ec1);
    const limitedEr1 = limitedRange.endRow;
    const limitedEc1 = limitedRange.endCol;
    const range = {
      startRow: sr1 - 1 + (hasHeader && sr1 === 1 ? 0 : headerOffset),
      endRow: limitedEr1 - 1 + headerOffset,
      startCol: sc1 - 1,
      endCol: limitedEc1 - 1,
    };
    const document = await readToolRange(context.workspaceId, sheetId, range);
    const data: SparseCell[] = document.cells
      .map((cell) => ({
        row: cell.row + 1 - headerOffset,
        col: cell.col + 1,
        value: cellText(cell),
      }))
      .filter((cell) => !hasHeader || cell.row > 0);
    const headers = Array.from({ length: limitedEc1 - sc1 + 1 }, (_, index) => {
      const cell = document.cells.find(
        (candidate) => candidate.row === 0 && candidate.col === sc1 - 1 + index,
      );
      return cell ? cellText(cell) : "";
    });
    const { columnTypes, columnStats, columnProfiles } = buildColumnAnalysis(
      document.cells,
      headers.length,
      headers,
      hasHeader,
      Math.max(0, limitedEr1 - (hasHeader ? 0 : -1)),
    );
    const merges = normalizeMerges(
      document.cells,
      document.objects,
      hasHeader,
      range.startRow,
      range.endRow,
      range.startCol,
      range.endCol,
    );
    const hasMoreRows = limitedEr1 < dataRowCount;
    const hasMoreCols = limitedEc1 < maxColumn;
    const wasLimitedByCellBudget = limitedEr1 < er1 || limitedEc1 < ec1;
    const hintParts: string[] = [];
    if (hasMoreRows) {
      hintParts.push(
        `还有${dataRowCount - limitedEr1}行未读取（可用 startRow=${limitedEr1 + 1} 继续读取）`,
      );
    }
    if (hasMoreCols) {
      hintParts.push(
        `还有${maxColumn - limitedEc1}列未读取（可用 startCol=${limitedEc1 + 1} 继续读取）`,
      );
    }
    if (wasLimitedByCellBudget) {
      hintParts.push(`本次读取受单次${MAX_CELLS_PER_READ}个单元格上限限制`);
    }
    if (!hasMoreRows && !hasMoreCols) hintParts.push("已读取全部数据");

    return {
      mode: "range" as const,
      sheetInfo: { sheetNo: sheet.sheetNo, sheetName: sheet.name },
      sheetName: sheet.name,
      sheetNo: sheet.sheetNo,
      totalRowCount: dataRowCount,
      totalColumnCount: maxColumn,
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
      merges,
      hasMoreRows,
      hasMoreCols,
      hasMoreRowsAbove: sr1 > 1,
      hint: hintParts.join("；"),
    };
  },
};
