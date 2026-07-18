import { DEFAULT_XLSX_CHART_IMPORT_LIMITS } from "@openexcel/core";
import { z } from "zod";

export const WORKBOOK_IMPORT_PAYLOAD_LIMITS = {
  maxWorkbooks: 20,
  maxSheetsPerWorkbook: 200,
  maxChartsPerWorkbook: DEFAULT_XLSX_CHART_IMPORT_LIMITS.maxChartsPerWorkbook,
  maxSeriesPerChart: DEFAULT_XLSX_CHART_IMPORT_LIMITS.maxSeriesPerChart,
  maxCellsPerSheet: 500_000,
  maxMergesPerSheet: 100_000,
  maxWorkbookNameLength: 255,
  maxSheetNameLength: 255,
  maxCellTextLength: 1_000_000,
  maxFormulaLength: 1_000_000,
  maxConfigBytes: 20 * 1024 * 1024,
  maxConfigDepth: 20,
  maxConfigNodes: 250_000,
  maxConfigStringLength: 1_000_000,
} as const;

const MAX_ROW = 1_048_575;
const MAX_COLUMN = 16_383;

const nonNegativeRow = z.number().int().min(0).max(MAX_ROW);
const nonNegativeColumn = z.number().int().min(0).max(MAX_COLUMN);
const mergeSize = z.number().int().min(1).max(1_048_576);

const cellAddressSchema = z.object({
  row: nonNegativeRow,
  col: nonNegativeColumn,
});

const importedRangeSchema = z
  .object({
    sheetKey: z.string().trim().min(1).max(255),
    start: cellAddressSchema,
    end: cellAddressSchema,
  })
  .strict()
  .refine(
    (range) => range.end.row === range.start.row || range.end.col === range.start.col,
    "图表数据范围必须是单行或单列",
  )
  .refine(
    (range) => range.end.row >= range.start.row && range.end.col >= range.start.col,
    "图表数据范围无效",
  );

const chartAnchorPointSchema = cellAddressSchema.extend({
  offsetXEmu: z.number().int().min(0).optional(),
  offsetYEmu: z.number().int().min(0).optional(),
});

const importedChartAnchorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("oneCell"),
      from: chartAnchorPointSchema,
      widthEmu: z.number().int().positive(),
      heightEmu: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("twoCell"),
      from: chartAnchorPointSchema,
      to: chartAnchorPointSchema,
    })
    .strict()
    .refine(
      (anchor) => anchor.to.row >= anchor.from.row && anchor.to.col >= anchor.from.col,
      "图表锚点范围无效",
    ),
  z
    .object({
      kind: z.literal("absolute"),
      xEmu: z.number().int().min(0),
      yEmu: z.number().int().min(0),
      widthEmu: z.number().int().positive(),
      heightEmu: z.number().int().positive(),
    })
    .strict(),
]);

const importedChartSeriesSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    name: z.union([z.string().trim().min(1).max(255), importedRangeSchema]).optional(),
    categoryRef: importedRangeSchema.optional(),
    valueRef: importedRangeSchema,
    chartType: z.enum(["bar", "line", "area"]).optional(),
  })
  .strict();

const importedChartSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    sheetKey: z.string().trim().min(1).max(255),
    type: z.enum(["bar", "line", "pie", "area", "scatter", "combo"]),
    title: z.string().max(255).optional(),
    anchor: importedChartAnchorSchema,
    series: z
      .array(importedChartSeriesSchema)
      .min(1)
      .max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxSeriesPerChart),
  })
  .strict();

const mergeCellSchema = z
  .object({
    r: nonNegativeRow,
    c: nonNegativeColumn,
    rs: mergeSize.optional(),
    cs: mergeSize.optional(),
  })
  .strict();

const borderSideSchema = z
  .object({
    s: z.number().int().min(0).max(13),
    c: z.string().max(32).optional(),
  })
  .strict();

const cellValueSchema = z
  .object({
    v: z.union([
      z.string().max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxCellTextLength),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
    m: z.string().max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxCellTextLength).optional(),
    f: z.string().max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxFormulaLength).optional(),
    mc: mergeCellSchema.optional(),
    bg: z.string().max(32).optional(),
    fc: z.string().max(32).optional(),
    fs: z.number().finite().min(1).max(4096).optional(),
    ff: z.string().max(255).optional(),
    bl: z.number().int().min(0).max(1).optional(),
    it: z.number().int().min(0).max(1).optional(),
    cl: z.number().int().min(0).max(1).optional(),
    un: z.number().int().min(0).max(1).optional(),
    ht: z.number().int().min(0).max(2).optional(),
    vt: z.number().int().min(0).max(2).optional(),
    tb: z.string().max(8).optional(),
    tr: z.number().finite().optional(),
    rt: z.number().finite().optional(),
    qp: z.number().finite().optional(),
    va: z.number().finite().optional(),
    ct: z
      .object({
        fa: z.string().max(255).optional(),
        t: z.string().max(32).optional(),
        s: z.array(z.json()).max(100).optional(),
      })
      .strict()
      .optional(),
    bd: z
      .object({
        t: borderSideSchema.optional(),
        b: borderSideSchema.optional(),
        l: borderSideSchema.optional(),
        r: borderSideSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const cellSchema = z
  .object({
    r: nonNegativeRow,
    c: nonNegativeColumn,
    v: cellValueSchema,
  })
  .strict();

const mergeRangeSchema = z
  .object({
    row: z.tuple([nonNegativeRow, nonNegativeRow]),
    col: z.tuple([nonNegativeColumn, nonNegativeColumn]),
  })
  .strict();

const jsonObjectSchema = z.record(z.string(), z.json());
export const filterSelectionSchema = z
  .object({
    row: z.tuple([nonNegativeRow, nonNegativeRow]),
    column: z.tuple([nonNegativeColumn, nonNegativeColumn]),
  })
  .strict()
  .refine((selection) => selection.row[0] <= selection.row[1], "筛选行范围无效")
  .refine((selection) => selection.column[0] <= selection.column[1], "筛选列范围无效");

export const importedSheetSchema = z
  .object({
    key: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxSheetNameLength),
    celldata: z.array(cellSchema),
    merges: z.array(mergeRangeSchema),
    config: jsonObjectSchema,
  })
  .strict();

export const importedWorkbookSchema = z
  .object({
    name: z.string().trim().min(1).max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxWorkbookNameLength),
    sheets: z.array(importedSheetSchema).min(1),
    charts: z.array(importedChartSchema).max(WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxChartsPerWorkbook),
  })
  .strict();

export const importedWorkbookBatchSchema = z
  .object({
    workbooks: z.array(importedWorkbookSchema).min(1),
  })
  .strict();

export type ImportedWorkbookPayload = z.infer<typeof importedWorkbookSchema>;
export type ImportedWorkbookBatchPayload = z.infer<typeof importedWorkbookBatchSchema>;

function visitJsonValue(value: unknown, depth: number, state: { nodes: number }): void {
  if (depth > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxConfigDepth) {
    throw new Error("配置 JSON 嵌套层级超过限制");
  }
  state.nodes += 1;
  if (state.nodes > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxConfigNodes) {
    throw new Error("配置 JSON 节点数量超过限制");
  }
  if (typeof value === "string") {
    if (value.length > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxConfigStringLength) {
      throw new Error("配置 JSON 字符串长度超过限制");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) visitJsonValue(item, depth + 1, state);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key.length > 255) throw new Error("配置 JSON 键名长度超过限制");
      visitJsonValue(item, depth + 1, state);
    }
  }
}

export function validateImportedConfig(config: Record<string, unknown>): void {
  const serialized = JSON.stringify(config);
  if (serialized.length > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxConfigBytes) {
    throw new Error("工作表配置大小超过限制");
  }
  validateImportedJsonValue(config);
}

export function validateImportedJsonValue(value: unknown): void {
  visitJsonValue(value, 0, { nodes: 0 });
}
