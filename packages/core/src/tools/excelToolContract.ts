import { z } from "zod";
import { chartSpecSchema } from "../chart/chartModel.js";
import { sheetChangePatchOutputSchema } from "../chat/sheetChange.js";
import {
  assertWriteRangesDoNotOverlap,
  parseWriteRange,
  writeRangeCellCount,
} from "../chat/writeRange.js";

const writeCellValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const writeCellValueTypeSchema = z.enum(["date", "string"]);
const writeCellValuesSchema = z.array(z.array(writeCellValueSchema).min(1)).min(1);
const writeRangeSchema = z.string().trim().min(1);
const writeFormulaSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Excel formula with A1 references; a leading equals sign is optional");
const writeOperationSchema = z
  .object({
    range: writeRangeSchema.describe("A1 range, for example A2:D10"),
    value: writeCellValueSchema.optional(),
    values: writeCellValuesSchema.optional(),
    valueType: writeCellValueTypeSchema.optional(),
    formula: writeFormulaSchema.optional(),
  })
  .superRefine((operation, ctx) => {
    const modes = [
      operation.value !== undefined,
      operation.values !== undefined,
      operation.formula !== undefined,
    ].filter(Boolean).length;
    if (modes !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A write operation must specify exactly one of value, values, or formula",
      });
    }
    if (operation.formula !== undefined && operation.valueType !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueType"],
        message: "Formula writes cannot specify valueType",
      });
    }
    if (operation.valueType === "date") {
      const values = operation.values ?? (operation.value === undefined ? [] : [operation.value]);
      if (values.some((value) => typeof value !== "string")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["valueType"],
          message: "Date writes must contain only strings",
        });
      }
    }
    if (operation.values) {
      const width = operation.values[0]?.length;
      if (width === undefined || operation.values.some((row) => row.length !== width)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["values"],
          message: "Every matrix row must have the same number of columns",
        });
      } else {
        try {
          const range = parseWriteRange(operation.range);
          if (
            operation.values.length !== range.endRow - range.startRow + 1 ||
            width !== range.endCol - range.startCol + 1
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["values"],
              message: "Matrix dimensions must exactly match the A1 range",
            });
          }
        } catch {
          // The range schema reports malformed input separately.
        }
      }
    }
    try {
      parseWriteRange(operation.range);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "The A1 range is invalid or outside the worksheet boundary",
      });
    }
  });
const sheetDataRangeSchema = z
  .string()
  .trim()
  .regex(/^\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?$/, "必须是 A1 范围，例如 A1:D20");

const sheetReadContinuationSchema = z.object({
  requestedRange: sheetDataRangeSchema.describe("本次读取的完整目标范围"),
  nextRow: z.coerce.number().int().positive().describe("下一页起始行号，从 1 开始"),
  nextCol: z.coerce.number().int().positive().describe("下一页起始列号，从 1 开始"),
});

const toolPageInputSchema = {
  offset: z.coerce.number().int().nonnegative().max(100_000).optional().describe("结果起始偏移量"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("单次返回的最大结果数，默认 50"),
};

const toolPageOutputSchema = z.object({
  nextOffset: z.number().int().nonnegative().nullable(),
});

const sheetCellStyleSchema = z
  .object({
    fill: z.string().trim().min(1).optional(),
    fontColor: z.string().trim().min(1).optional(),
    bold: z.boolean().optional(),
    numberFormat: z.string().trim().min(1).optional(),
  })
  .refine((style) => Object.values(style).some((value) => value !== undefined), {
    message: "style 至少需要指定一个格式条件",
  });

const sheetCellQuerySchema = z
  .object({
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    valueType: z.enum(["empty", "string", "number", "boolean", "date", "formula"]).optional(),
    formula: z
      .union([
        z.literal("exists"),
        z.object({ exact: z.string().min(1) }),
        z.object({ r1c1: z.string().min(1) }),
      ])
      .optional(),
    style: sheetCellStyleSchema.optional(),
  })
  .refine((query) => Object.values(query).some((value) => value !== undefined), {
    message: "至少指定一个值、公式或格式条件",
  });

const readSheetDataInputSchema = z.discriminatedUnion("operation", [
  z.object({
    sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
    operation: z.literal("overview").describe("读取 Sheet 的结构概览"),
  }),
  z.object({
    sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
    operation: z.literal("range").describe("读取指定范围的数据和布局"),
    range: sheetDataRangeSchema.optional().describe("A1 范围，例如 A1:D20；默认已使用区域"),
    format: z
      .enum(["compact", "exact"])
      .default("compact")
      .describe("compact 返回带列标题的紧凑布局；exact 返回完整二维矩阵"),
    continuation: sheetReadContinuationSchema
      .optional()
      .describe("上一次读取返回的 continuation；传入后继续同一目标范围"),
  }),
  z.object({
    sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
    operation: z.literal("find").describe("按值、类型、公式或格式查找单元格"),
    range: sheetDataRangeSchema.optional().describe("搜索范围，例如 A1:Z100；默认已使用区域"),
    query: sheetCellQuerySchema,
    ...toolPageInputSchema,
  }),
]);

const chartAnchorPointSchema = z.object({
  row: z.coerce.number().int().positive().describe("行号，从 1 开始"),
  col: z.coerce.number().int().positive().describe("列号，从 1 开始"),
});

const chartAnchorSchema = z
  .object({
    kind: z
      .enum(["oneCell", "twoCell", "absolute"])
      .describe("锚点类型：oneCell、twoCell 或 absolute"),
    from: chartAnchorPointSchema.optional().describe("oneCell/twoCell 的左上角单元格"),
    to: chartAnchorPointSchema.optional().describe("twoCell 的右下角单元格"),
    widthEmu: z.coerce.number().int().positive().optional().describe("oneCell/absolute 宽度"),
    heightEmu: z.coerce.number().int().positive().optional().describe("oneCell/absolute 高度"),
    xEmu: z.coerce.number().int().nonnegative().optional().describe("absolute 的水平位置"),
    yEmu: z.coerce.number().int().nonnegative().optional().describe("absolute 的垂直位置"),
  })
  .superRefine((anchor, ctx) => {
    const requireField = (field: keyof typeof anchor, message: string) => {
      if (anchor[field] === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      }
    };

    if (anchor.kind === "oneCell") {
      requireField("from", "oneCell 锚点需要 from");
      requireField("widthEmu", "oneCell 锚点需要 widthEmu");
      requireField("heightEmu", "oneCell 锚点需要 heightEmu");
    } else if (anchor.kind === "twoCell") {
      requireField("from", "twoCell 锚点需要 from");
      requireField("to", "twoCell 锚点需要 to");
    } else {
      requireField("xEmu", "absolute 锚点需要 xEmu");
      requireField("yEmu", "absolute 锚点需要 yEmu");
      requireField("widthEmu", "absolute 锚点需要 widthEmu");
      requireField("heightEmu", "absolute 锚点需要 heightEmu");
    }
  })
  .describe(
    "使用扁平对象传递图表位置，避免 oneOf。oneCell 需要 kind/from/widthEmu/heightEmu；twoCell 需要 kind/from/to；absolute 需要 kind/xEmu/yEmu/widthEmu/heightEmu。行列号从 1 开始。",
  );

const chartRangeSchema = z
  .object({
    sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
    startRow: z.coerce.number().int().positive().describe("起始行号，从 1 开始"),
    startCol: z.coerce.number().int().positive().describe("起始列号，从 1 开始"),
    endRow: z.coerce.number().int().positive().describe("结束行号，从 1 开始"),
    endCol: z.coerce.number().int().positive().describe("结束列号，从 1 开始"),
  })
  .superRefine((range, ctx) => {
    if (range.endRow < range.startRow || range.endCol < range.startCol) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid chart range" });
    }
    if (range.endRow > range.startRow && range.endCol > range.startCol) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chart data ranges must be a single row or a single column",
      });
    }
  });

const chartSourceRangeSchema = z
  .object({
    sheetId: z.coerce.number().int().positive().describe("数据所在 Sheet ID"),
    startRow: z.coerce.number().int().positive().describe("数据起始行号，从 1 开始"),
    startCol: z.coerce.number().int().positive().describe("数据起始列号，从 1 开始"),
    endRow: z.coerce.number().int().positive().describe("数据结束行号，从 1 开始"),
    endCol: z.coerce.number().int().positive().describe("数据结束列号，从 1 开始"),
  })
  .superRefine((range, ctx) => {
    if (range.endRow < range.startRow || range.endCol < range.startCol) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid chart source range" });
    }
    if (range.endRow === range.startRow && range.endCol === range.startCol) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chart source ranges must contain at least two cells",
      });
    }
  });

const chartComboSeriesTypeSchema = z.enum(["bar", "line", "area"]);

function chartRangeLength(range: z.infer<typeof chartRangeSchema>): number {
  return Math.max(range.endRow - range.startRow, range.endCol - range.startCol) + 1;
}

const chartSeriesSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.union([z.string().trim().min(1), chartRangeSchema]).optional(),
    categoryRef: chartRangeSchema.optional(),
    valueRef: chartRangeSchema,
    chartType: z.enum(["bar", "line", "pie", "doughnut", "area", "scatter", "radar"]).optional(),
  })
  .superRefine((series, ctx) => {
    if (
      series.categoryRef &&
      chartRangeLength(series.categoryRef) !== chartRangeLength(series.valueRef)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueRef"],
        message: "Category and value ranges must have the same length",
      });
    }
  });

const chartCreateSeriesSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    name: z.union([z.string().trim().min(1), chartRangeSchema]).optional(),
    categoryRef: chartRangeSchema.optional(),
    valueRef: chartRangeSchema,
    chartType: z.enum(["bar", "line", "pie", "doughnut", "area", "scatter", "radar"]).optional(),
  })
  .superRefine((series, ctx) => {
    if (
      series.categoryRef &&
      chartRangeLength(series.categoryRef) !== chartRangeLength(series.valueRef)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueRef"],
        message: "Category and value ranges must have the same length",
      });
    }
  });

const chartCreateSchema = z
  .object({
    workbookId: z.coerce.number().int().positive().describe("工作簿 ID"),
    sheetId: z.coerce.number().int().positive().describe("图表所在 Sheet ID"),
    type: z.enum(["bar", "line", "pie", "doughnut", "area", "scatter", "radar", "combo"]),
    title: z.string().optional(),
    anchor: chartAnchorSchema,
    sourceRange: chartSourceRangeSchema.optional(),
    series: z.array(chartCreateSeriesSchema).min(1).optional(),
    seriesTypes: z
      .array(chartComboSeriesTypeSchema)
      .min(1)
      .optional()
      .describe("组合图中各数据系列的类型，顺序对应数据源生成的系列"),
  })
  .superRefine((chart, ctx) => {
    if ((chart.sourceRange == null) === (chart.series == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRange"],
        message: "Provide exactly one chart data source: sourceRange or series",
      });
    }

    const rows = chart.sourceRange ? chart.sourceRange.endRow - chart.sourceRange.startRow + 1 : 0;
    const columns = chart.sourceRange
      ? chart.sourceRange.endCol - chart.sourceRange.startCol + 1
      : 0;
    const isTable = rows >= 2 && columns >= 2;
    if (
      chart.sourceRange &&
      (chart.type === "pie" || chart.type === "doughnut") &&
      (!isTable || columns !== 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRange"],
        message: "Pie and doughnut charts require a two-column table: category and value",
      });
    }
    if (chart.sourceRange && (chart.type === "scatter" || chart.type === "radar") && !isTable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRange"],
        message: "Scatter and radar charts require a table with a category column",
      });
    }
    if (chart.seriesTypes && (chart.type !== "combo" || chart.series != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seriesTypes"],
        message: "seriesTypes are only valid for combo charts using sourceRange",
      });
    }
    if (chart.sourceRange && chart.type === "combo" && chart.seriesTypes) {
      const expectedSeriesCount = isTable ? columns - 1 : 1;
      if (chart.seriesTypes.length !== expectedSeriesCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["seriesTypes"],
          message: `Combo charts require ${expectedSeriesCount} series types for this source range`,
        });
      }
    }

    if (chart.series) {
      if ((chart.type === "pie" || chart.type === "doughnut") && chart.series.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series"],
          message: "Pie and doughnut charts require exactly one series",
        });
      }
      for (const [index, series] of chart.series.entries()) {
        if (
          (chart.type === "pie" ||
            chart.type === "doughnut" ||
            chart.type === "scatter" ||
            chart.type === "radar") &&
          !series.categoryRef
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", index, "categoryRef"],
            message: `${chart.type} charts require categoryRef`,
          });
        }
        if (chart.type === "combo") {
          if (!series.chartType || !["bar", "line", "area"].includes(series.chartType)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["series", index, "chartType"],
              message: "Combo chart series must use bar, line, or area",
            });
          }
        } else if (series.chartType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", index, "chartType"],
            message: "chartType is only valid for combo charts",
          });
        }
      }
    }
  });

const workbookSummaryOutputSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
});

const sheetSummaryOutputSchema = z.object({
  id: z.number().int().positive(),
  sheetNo: z.number().int().positive(),
  name: z.string(),
});

const sheetReadExactOutputSchema = z.object({
  mode: z.literal("exact"),
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  range: z.string().min(1),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  dateValues: z.record(z.string(), z.string()).optional(),
  formulaPatterns: z.array(
    z.object({
      ranges: z.array(z.string().min(1)),
      formulaR1C1: z.string().min(1),
    }),
  ),
  formulaExceptions: z.array(
    z.object({
      cell: z.string().min(1),
      formula: z.string().min(1),
    }),
  ),
  merges: z.array(
    z.object({
      range: z.string().min(1),
      anchor: z.string().min(1),
      rowSpan: z.number().int().positive(),
      colSpan: z.number().int().positive(),
      clipped: z.boolean().optional(),
      anchorValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    }),
  ),
  continuation: z
    .object({
      requestedRange: z.string().min(1),
      nextRow: z.number().int().positive(),
      nextCol: z.number().int().positive(),
    })
    .nullable(),
});

const sheetTableOutputSchema = z.object({
  mode: z.literal("compact"),
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  range: z.string().min(1),
  columns: z.array(z.string().min(1)),
  rows: z.array(
    z.object({
      row: z.number().int().positive(),
      values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
  ),
  merges: sheetReadExactOutputSchema.shape.merges,
  formulaPatterns: sheetReadExactOutputSchema.shape.formulaPatterns,
  annotations: z.array(
    z.object({
      cell: z.string().min(1),
      formula: z.string().min(1).optional(),
      date: z.string().min(1).optional(),
      numberFormat: z.string().min(1).optional(),
    }),
  ),
  continuation: sheetReadExactOutputSchema.shape.continuation,
});

const sheetOverviewOutputSchema = z.object({
  mode: z.literal("overview"),
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  usedRange: z.string().min(1),
  nonEmptyCellCount: z.number().int().nonnegative(),
  mergeRanges: z.array(z.string().min(1)),
  formulaPatterns: z.array(
    z.object({
      formulaR1C1: z.string().min(1),
      count: z.number().int().positive(),
    }),
  ),
  columns: z.array(
    z.object({
      column: z.string().min(1),
      types: z.array(z.enum(["string", "number", "boolean", "date", "formula"])),
    }),
  ),
});

const sheetCellMatchesOutputSchema = z.object({
  mode: z.literal("find"),
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  matches: z.array(
    z.object({
      range: z.string().min(1),
      count: z.number().int().positive(),
      reason: z.string().min(1),
    }),
  ),
  ...toolPageOutputSchema.shape,
});

const sheetReadOutputSchema = z.discriminatedUnion("mode", [
  sheetOverviewOutputSchema,
  sheetTableOutputSchema,
  sheetReadExactOutputSchema,
  sheetCellMatchesOutputSchema,
]);

const sheetObjectOutputSchema = z.object({
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  objectType: z.literal("filters"),
  objects: z.array(
    z.object({
      kind: z.literal("filter"),
      range: z.string().min(1),
    }),
  ),
});

const sheetMutationOutputSchema = sheetChangePatchOutputSchema.extend({
  success: z.literal(true),
  updatedCells: z.number().int().nonnegative().optional(),
  clearedCells: z.number().int().nonnegative().optional(),
  mergedRanges: z.array(z.string().min(1)).optional(),
  unmergedRanges: z.array(z.string().min(1)).optional(),
  preview: z
    .object({
      sheetId: z.number().int().positive(),
      sheetName: z.string().min(1),
      range: z.object({
        startRow: z.number().int().positive(),
        endRow: z.number().int().positive(),
        startCol: z.number().int().positive(),
        endCol: z.number().int().positive(),
      }),
      rows: z.array(
        z.object({
          row: z.number().int().positive(),
          values: z.array(z.string()),
        }),
      ),
      merges: z.array(
        z.object({
          startRow: z.number().int().positive(),
          startCol: z.number().int().positive(),
          endRow: z.number().int().positive(),
          endCol: z.number().int().positive(),
          clipped: z.boolean(),
        }),
      ),
      truncated: z.boolean(),
    })
    .optional(),
  previewLabel: z.string().optional(),
});

const workbookCreatedOutputSchema = z.object({
  id: z.number().int().positive(),
  publicId: z.string().min(1),
  name: z.string(),
  order: z.number().int().nonnegative(),
  sheets: z.number().int().positive(),
  initialSheet: z.object({
    id: z.number().int().positive(),
    sheetNo: z.number().int().positive(),
    name: z.string(),
    order: z.number().int().nonnegative(),
  }),
});

const sheetCreatedOutputSchema = z.object({
  workbookId: z.number().int().positive(),
  id: z.number().int().positive(),
  sheetNo: z.number().int().positive(),
  name: z.string(),
  order: z.number().int().nonnegative(),
});

const chartCreatedOutputSchema = z.object({
  success: z.literal(true),
  chartId: z.string().min(1),
  workbookId: z.number().int().positive(),
  sheetId: z.number().int().positive(),
  dataQuality: z
    .object({
      categoryCount: z.number().int().nonnegative(),
      missingCategoryIndexes: z.array(z.number().int().nonnegative()),
      missingCategoryIndexesTruncated: z.boolean().optional(),
      series: z.array(
        z.object({
          seriesId: z.string().min(1),
          name: z.string(),
          pointCount: z.number().int().nonnegative(),
          missingValueIndexes: z.array(z.number().int().nonnegative()),
          nonNumericValueIndexes: z.array(z.number().int().nonnegative()),
          formulaCells: z.array(z.string()),
          unresolvedFormulaCells: z.array(z.string()),
          indexesTruncated: z.boolean().optional(),
        }),
      ),
      seriesTruncated: z.boolean().optional(),
    })
    .optional(),
});

const chartUpdatedOutputSchema = z.object({
  success: z.literal(true),
  chartId: z.string().min(1),
});

const chartDeletedOutputSchema = z.object({
  success: z.literal(true),
  chartId: z.string().min(1),
});

export type ExcelToolSpec = {
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  needsRunContext: boolean;
};

export const MAX_WRITE_CELLS_PER_CALL = 10_000;

export const excelToolSpecs = {
  createWorkbook: {
    description:
      "新建一个工作簿，并同时创建第一个 Sheet。仅在用户明确要求创建新工作簿时使用。可选地传入初始工作簿名称、初始 Sheet 名称，或者从已有 Sheet 复制初始结构。",
    needsRunContext: true,
    outputSchema: workbookCreatedOutputSchema,
    inputSchema: z.object({
      name: z.string().trim().min(1).optional().describe("工作簿名称"),
      sheetName: z.string().trim().min(1).optional().describe("初始 Sheet 名称"),
      sourceSheetId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("可选的源 Sheet ID，用于复制初始结构"),
    }),
  },
  createSheet: {
    description:
      "在指定工作簿中创建一个新的 Sheet。仅在用户明确要求新增 Sheet 时使用。可选地传入名称，或者从已有 Sheet 复制初始结构。",
    needsRunContext: true,
    outputSchema: sheetCreatedOutputSchema,
    inputSchema: z.object({
      workbookId: z.coerce.number().int().positive().describe("工作簿 ID"),
      name: z.string().trim().min(1).optional().describe("Sheet 名称"),
      sourceSheetId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("可选的源 Sheet ID，用于复制初始结构"),
    }),
  },
  readSheetData: {
    description:
      "读取指定 Sheet 的数据。operation=overview 返回低 token 的使用范围、合并区域、公式模式和列类型；operation=range 默认返回带列标题和行号的紧凑布局，format=exact 返回完整二维 values、日期、公式和合并区域；operation=find 按值、类型、公式或直接格式定位单元格。compact 中省略空尾列和空行，合并区域单独在 merges 中描述，日期在 annotations 中使用无时区字符串，公式缓存值按单元格保留，重复公式通过 formulaPatterns 表达。range 超过单次网格预算时返回 continuation，下一次原样传回 continuation。",
    inputSchema: readSheetDataInputSchema,
    needsRunContext: false,
    outputSchema: sheetReadOutputSchema,
  },
  readSheetObjects: {
    description:
      "读取指定 Sheet 的筛选范围摘要。图表请使用 listCharts；Table 和 PivotTable 当前尚未建模，不在可用工具中暴露。",
    inputSchema: z.object({
      sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
      objectType: z.literal("filters"),
    }),
    needsRunContext: false,
    outputSchema: sheetObjectOutputSchema,
  },
  writeCells: {
    description:
      "Write cell contents in non-overlapping A1 ranges. Each operation must use exactly one mode: value fills the range, values supplies an exact matrix, or formula fills the range using relative Excel references. Use valueType:'date' or valueType:'string' when date or text semantics must be preserved. Dates must be timezone-free strings. This tool does not modify styles, filters, charts, or other Excel objects; use clearCells to remove content.",
    needsRunContext: true,
    outputSchema: sheetMutationOutputSchema,
    inputSchema: z.object({
      sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
      operations: z
        .array(writeOperationSchema)
        .min(1)
        .superRefine((operations, ctx) => {
          const ranges = [];
          let cellCount = 0;
          for (const operation of operations) {
            try {
              const range = parseWriteRange(operation.range);
              ranges.push(range);
              cellCount += writeRangeCellCount(range);
            } catch {
              continue;
            }
            if (cellCount > MAX_WRITE_CELLS_PER_CALL) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "A writeCells call may contain at most 10000 cells",
              });
              return;
            }
          }
          try {
            assertWriteRangesDoNotOverlap(ranges);
          } catch (error) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: error instanceof Error ? error.message : "Write ranges must not overlap",
            });
          }
        })
        .describe("Write operations, each using an A1 range"),
    }),
  },
  clearCells: {
    description:
      "清空单元格内容，不修改单元格的非内容属性。使用 operations 数组，cell 用于清空离散单格，range 用于清空连续区域。行号和列号都从 1 开始；如果要写入内容，请使用 writeCells。",
    needsRunContext: true,
    outputSchema: sheetMutationOutputSchema,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z
        .array(
          z.discriminatedUnion("type", [
            z.object({
              type: z.literal("cell"),
              row: z.coerce.number().positive().describe("行号，从 1 开始"),
              col: z.coerce.number().positive().describe("列号，从 1 开始"),
            }),
            z.object({
              type: z.literal("range"),
              startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
              startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
              endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
              endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
            }),
          ]),
        )
        .min(1)
        .describe("清空操作列表，支持离散单元格和连续范围"),
    }),
  },
  mergeCells: {
    description:
      "合并指定范围的单元格。使用 operations 数组，每项都是一个 range；合并后只有左上角单元格保留内容，范围内其他单元格的内容会被清除。该工具只处理合并状态和单元格内容，不修改样式或其他 Excel 对象；行号和列号都从 1 开始。",
    needsRunContext: true,
    outputSchema: sheetMutationOutputSchema,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z
        .array(
          z.object({
            type: z.literal("range"),
            startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
            startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
            endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
            endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
          }),
        )
        .min(1)
        .describe("要合并的范围列表，行号和列号都从 1 开始"),
    }),
  },
  unmergeCells: {
    description:
      "取消指定范围内的单元格合并。使用 operations 数组，每项都是一个 range；取消后每个单元格独立，但不会恢复合并时已清除的非左上角内容。该工具不修改样式或其他 Excel 对象；行号和列号都从 1 开始。",
    needsRunContext: true,
    outputSchema: sheetMutationOutputSchema,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z
        .array(
          z.object({
            type: z.literal("range"),
            startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
            startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
            endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
            endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
          }),
        )
        .min(1)
        .describe("要取消合并的范围列表，行号和列号都从 1 开始"),
    }),
  },
  createChart: {
    description:
      "在工作簿中创建真实 Excel 图表。数据源有两种模式：sourceRange 用于连续矩形表格，按首行系列标题、首列分类自动生成多个系列；series 用于显式指定每个系列的 categoryRef、valueRef 和 name，因此可以引用不连续列、不同 Sheet 或不同区域。sourceRange 和 series 只能二选一。饼图、环形图需要分类和数值，散点图需要 X 轴分类引用，雷达图需要分类轴和一个或多个数值系列；组合图的显式系列必须指定 bar、line 或 area。图表、系列和引用会作为独立对象保存，并可随工作簿导出为 XLSX；行列号从 1 开始，Sheet ID 必须是真实 ID。",
    needsRunContext: true,
    outputSchema: chartCreatedOutputSchema,
    inputSchema: chartCreateSchema,
  },
  updateChart: {
    description:
      "修改已存在的真实 Excel 图表。只传入需要修改的字段；删除标题时传 null。不会把 ECharts 配置写入工作簿。",
    needsRunContext: true,
    outputSchema: chartUpdatedOutputSchema,
    inputSchema: z.object({
      chartId: z.string().trim().min(1),
      patch: z.object({
        type: z
          .enum(["bar", "line", "pie", "doughnut", "area", "scatter", "radar", "combo"])
          .optional(),
        title: z.string().nullable().optional(),
        sheetId: z.coerce.number().int().positive().optional(),
        anchor: chartAnchorSchema.optional(),
        series: z.array(chartSeriesSchema).min(1).optional(),
      }),
    }),
  },
  deleteChart: {
    description: "删除指定的真实 Excel 图表，不修改图表引用的单元格数据。",
    needsRunContext: true,
    outputSchema: chartDeletedOutputSchema,
    inputSchema: z.object({ chartId: z.string().trim().min(1) }),
  },
  listCharts: {
    description:
      "列出指定工作簿中的真实 Excel 图表及其数据引用。结果按 offset/limit 分页，返回 nextOffset 时继续读取。",
    inputSchema: z.object({
      workbookId: z.coerce.number().int().positive(),
      ...toolPageInputSchema,
    }),
    needsRunContext: false,
    outputSchema: z.object({
      charts: z.array(chartSpecSchema),
      ...toolPageOutputSchema.shape,
    }),
  },
} satisfies Record<string, ExcelToolSpec>;

export type ExcelToolName = keyof typeof excelToolSpecs;

export type ExcelToolInput<Name extends ExcelToolName> = z.infer<
  (typeof excelToolSpecs)[Name]["inputSchema"]
>;
