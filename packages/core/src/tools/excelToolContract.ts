import { z } from "zod";
import { chartSpecSchema } from "../chart/chartModel.js";
import { sheetChangePatchOutputSchema } from "../chat/sheetChange.js";

const writeCellValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const writeCellValueTypeSchema = z.literal("date");
const writeFormulaSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Excel 公式表达式，支持 A1 引用；可带或不带前导等号，系统会自动规范化");

const sheetDataRangeSchema = z
  .string()
  .trim()
  .regex(/^\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?$/, "必须是 A1 范围，例如 A1:D20");

const sheetReadContinuationSchema = z.object({
  requestedRange: sheetDataRangeSchema.describe("本次读取的完整目标范围"),
  nextRow: z.coerce.number().int().positive().describe("下一页起始行号，从 1 开始"),
  nextCol: z.coerce.number().int().positive().describe("下一页起始列号，从 1 开始"),
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
    name: z.string().trim().min(1).optional(),
    categoryRef: chartRangeSchema.optional(),
    valueRef: chartRangeSchema,
    chartType: z.enum(["bar", "line", "pie", "area", "scatter"]).optional(),
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
    type: z.enum(["bar", "line", "pie", "area", "scatter", "combo"]),
    title: z.string().optional(),
    anchor: chartAnchorSchema,
    sourceRange: chartSourceRangeSchema,
    seriesTypes: z
      .array(chartComboSeriesTypeSchema)
      .min(1)
      .optional()
      .describe("组合图中各数据系列的类型，顺序对应数据源生成的系列"),
  })
  .superRefine((chart, ctx) => {
    const rows = chart.sourceRange.endRow - chart.sourceRange.startRow + 1;
    const columns = chart.sourceRange.endCol - chart.sourceRange.startCol + 1;
    const isTable = rows >= 2 && columns >= 2;
    if (chart.type === "pie" && (!isTable || columns !== 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRange"],
        message: "Pie charts require a two-column table: category and value",
      });
    }
    if (chart.type === "scatter" && !isTable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRange"],
        message: "Scatter charts require a table with an X column",
      });
    }
    if (chart.seriesTypes && chart.type !== "combo") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seriesTypes"],
        message: "Series types are only valid for combo charts",
      });
    }
    if (chart.type === "combo" && chart.seriesTypes) {
      const expectedSeriesCount = isTable ? columns - 1 : 1;
      if (chart.seriesTypes.length !== expectedSeriesCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["seriesTypes"],
          message: `Combo charts require ${expectedSeriesCount} series types for this source range`,
        });
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

const sheetReadOutputSchema = z.object({
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

const sheetCellMatchesOutputSchema = z.object({
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  matches: z.array(
    z.object({
      range: z.string().min(1),
      count: z.number().int().positive(),
      reason: z.string().min(1),
    }),
  ),
});

const sheetObjectOutputSchema = z.object({
  workbook: workbookSummaryOutputSchema,
  sheet: sheetSummaryOutputSchema,
  objectType: z.enum(["charts", "filters", "tables", "pivotTables"]),
  objects: z.array(
    z.union([
      z.object({
        kind: z.literal("chart"),
        id: z.string().min(1),
        type: z.enum(["bar", "line", "pie", "area", "scatter", "combo"]),
        title: z.string().nullable(),
        anchor: z.string().min(1),
        series: z.array(
          z.object({
            id: z.string().min(1),
            name: z.string().nullable(),
            categoryRange: z.string().nullable(),
            valueRange: z.string().min(1),
            chartType: z.enum(["bar", "line", "pie", "area", "scatter"]).nullable(),
          }),
        ),
      }),
      z.object({
        kind: z.literal("filter"),
        range: z.string().min(1),
      }),
    ]),
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
      "读取指定 Sheet 的矩形数据。返回 range 对应的二维 values、稀疏的 dateValues、压缩后的公式模式、非统一公式和合并区域；日期在 values 中保留 Excel 序列号，模型使用 dateValues 中的无时区字符串理解日期。null 是真实空单元格，数字 0 保持为 0，不推断表头，不返回样式或 Excel 对象。未传 range 时读取已使用区域；超过单次网格预算时返回 continuation，下一次原样传回 continuation 读取下一页。",
    inputSchema: z.object({
      sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
      range: sheetDataRangeSchema.optional().describe("A1 范围，例如 A1:D20；默认已使用区域"),
      continuation: sheetReadContinuationSchema
        .optional()
        .describe("上一次读取返回的 continuation；传入后继续同一目标范围"),
    }),
    needsRunContext: false,
    outputSchema: sheetReadOutputSchema,
  },
  findSheetCells: {
    description:
      "在指定 Sheet 的范围内定位满足值、值类型、公式或直接格式条件的单元格。只返回合并后的 A1 区域、数量和查询原因，不返回完整数据矩阵；找到区域后再调用 readSheetData 读取内容。未传 range 时搜索已使用区域；查找空单元格时必须传入足够小的范围。颜色属于格式条件，不能写进 values。",
    inputSchema: z.object({
      sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
      range: sheetDataRangeSchema.optional().describe("搜索范围，例如 A1:Z100；默认已使用区域"),
      query: sheetCellQuerySchema,
    }),
    needsRunContext: false,
    outputSchema: sheetCellMatchesOutputSchema,
  },
  readSheetObjects: {
    description:
      "读取指定 Sheet 的一种 Excel 对象摘要。必须指定 objectType：charts、filters、tables 或 pivotTables。返回模型决策所需的引用和范围，不返回 OOXML、ECharts option 或完整绘图缓存。",
    inputSchema: z.object({
      sheetId: z.coerce.number().int().positive().describe("Sheet ID"),
      objectType: z.enum(["charts", "filters", "tables", "pivotTables"]),
    }),
    needsRunContext: false,
    outputSchema: sheetObjectOutputSchema,
  },
  writeCells: {
    description:
      "批量写入单元格内容。使用 operations 数组，支持 cell 离散写入和 range 连续区域填充同一个值或公式。value 可以是字符串、数字或布尔值；修改真正的 Excel 日期时，必须传 valueType:'date' 和无时区的 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss 字符串，不能自行计算 Excel 序列号。写公式时传入 formula，并且只有已知结果时才提供 value 作为缓存显示值。行号和列号都从 1 开始；该工具不修改样式、筛选、图表或其他 Excel 对象，也不负责通用公式重算；清空内容请使用 clearCells。",
    needsRunContext: true,
    outputSchema: sheetMutationOutputSchema,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z
        .array(
          z.discriminatedUnion("type", [
            z
              .object({
                type: z.literal("cell"),
                row: z.coerce.number().positive().describe("行号，从 1 开始"),
                col: z.coerce.number().positive().describe("列号，从 1 开始"),
                value: writeCellValueSchema.describe("写入的值"),
                valueType: writeCellValueTypeSchema.optional().describe("日期写入时传 date"),
                formula: writeFormulaSchema.optional(),
              })
              .refine((value) => value.formula != null || value.value != null, {
                message: "Cell write requires a value or formula",
              })
              .refine((value) => value.valueType !== "date" || typeof value.value === "string", {
                message: "日期值必须是字符串",
              })
              .refine((value) => value.valueType !== "date" || value.formula == null, {
                message: "日期写入不能同时写公式",
              }),
            z
              .object({
                type: z.literal("range"),
                startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
                startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
                endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
                endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
                value: writeCellValueSchema.describe("写入的值"),
                valueType: writeCellValueTypeSchema.optional().describe("日期写入时传 date"),
                formula: writeFormulaSchema.optional(),
              })
              .refine((value) => value.endRow >= value.startRow && value.endCol >= value.startCol, {
                message: "Invalid sheet range",
              })
              .refine((value) => value.formula != null || value.value != null, {
                message: "Range write requires a value or formula",
              })
              .refine((value) => value.valueType !== "date" || typeof value.value === "string", {
                message: "日期值必须是字符串",
              })
              .refine((value) => value.valueType !== "date" || value.formula == null, {
                message: "日期写入不能同时写公式",
              }),
          ]),
        )
        .min(1)
        .superRefine((operations, ctx) => {
          let cellCount = 0;
          for (const operation of operations) {
            cellCount +=
              operation.type === "cell"
                ? 1
                : (operation.endRow - operation.startRow + 1) *
                  (operation.endCol - operation.startCol + 1);
            if (cellCount > MAX_WRITE_CELLS_PER_CALL) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "单次 writeCells 最多写入 10000 个单元格",
              });
              return;
            }
          }
        })
        .describe("写入操作列表，支持离散单元格和连续范围"),
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
      '在工作簿中创建真实 Excel 图表。传入一个连续数据源矩形范围即可，系统会按 Excel 规则将首行作为系列标题、首列作为分类并生成多个系列；单行和单列范围也支持。anchor 必须是扁平对象，推荐使用 twoCell，例如 { kind: "twoCell", from: { row: 2, col: 8 }, to: { row: 16, col: 14 } }，不要传字符串范围或嵌套 oneOf。创建组合图时可额外传入 seriesTypes 指定每个系列为 bar、line 或 area，但不需要传入具体数据值。图表、系列和引用会作为独立对象保存，并可随工作簿导出为 XLSX；行列号从 1 开始，Sheet ID 必须是真实 ID。',
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
        type: z.enum(["bar", "line", "pie", "area", "scatter", "combo"]).optional(),
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
    description: "列出指定工作簿中的真实 Excel 图表及其数据引用。",
    inputSchema: z.object({ workbookId: z.coerce.number().int().positive() }),
    needsRunContext: false,
    outputSchema: z.array(chartSpecSchema),
  },
} satisfies Record<string, ExcelToolSpec>;

export type ExcelToolName = keyof typeof excelToolSpecs;

export type ExcelToolInput<Name extends ExcelToolName> = z.infer<
  (typeof excelToolSpecs)[Name]["inputSchema"]
>;
