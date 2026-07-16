import { z } from "zod";

const writeCellValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const writeFormulaSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Excel 公式表达式，支持 A1 引用；可带或不带前导等号，系统会自动规范化");

export type ExcelToolSpec = {
  description: string;
  inputSchema: z.ZodTypeAny;
  needsRunContext?: boolean;
};

export const workspaceToolContextSchema = z.object({
  workspaceId: z.coerce.number().int().positive(),
});

export const runToolContextSchema = workspaceToolContextSchema.extend({
  runId: z.coerce.number().int().positive(),
});

export type WorkspaceToolContext = z.infer<typeof workspaceToolContextSchema>;
export type RunToolContext = z.infer<typeof runToolContextSchema>;

export const excelToolSpecs = {
  createWorkbook: {
    description:
      "新建一个工作簿，并同时创建第一个 Sheet。仅在用户明确要求创建新工作簿时使用。可选地传入初始工作簿名称、初始 Sheet 名称，或者从已有 Sheet 复制初始结构。",
    needsRunContext: true,
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
  readSheet: {
    description:
      "读取指定 Sheet 的单元格数据和基础分析结果。首次或不传范围时返回 overview：整表规模、列画像、数值统计、空值情况，以及头部/中部/尾部的少量代表性样本；传入 startRow/endRow/startCol/endCol 或 mode=range 时返回指定范围的稀疏数据。单次范围最多返回约4000个网格单元。该工具不返回完整样式、公式表达式、图表、透视表、VBA 或其他 Excel 对象；行号和列号按 Excel 视觉顺序从 1 开始。",
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      mode: z
        .enum(["overview", "range"])
        .optional()
        .describe("读取模式；不传范围参数时默认 overview，传入范围参数时默认 range"),
      startRow: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("起始行号（含），从 1 开始，默认 1"),
      endRow: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("结束行号（含），从 1 开始，默认 30"),
      startCol: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("起始列号（含），从 1 开始，默认 1"),
      endCol: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("结束列号（含），从 1 开始，默认全部列"),
      includeMetadata: z
        .boolean()
        .optional()
        .describe("范围读取时是否重复返回列画像；默认 false，overview 模式始终返回"),
    }),
  },
  writeCells: {
    description:
      "批量写入单元格内容。使用 operations 数组，支持 cell 离散写入和 range 连续区域填充同一个值或公式。value 可以是字符串、数字或布尔值；写公式时传入 formula，并且只有已知结果时才提供 value 作为缓存显示值。行号和列号都从 1 开始；该工具不修改样式、筛选、图表或其他 Excel 对象，也不负责通用公式重算；清空内容请使用 clearCells。",
    needsRunContext: true,
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
                formula: writeFormulaSchema.optional(),
              })
              .refine((value) => value.formula != null || value.value != null, {
                message: "Cell write requires a value or formula",
              }),
            z
              .object({
                type: z.literal("range"),
                startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
                startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
                endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
                endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
                value: writeCellValueSchema.describe("写入的值"),
                formula: writeFormulaSchema.optional(),
              })
              .refine((value) => value.endRow >= value.startRow && value.endCol >= value.startCol, {
                message: "Invalid sheet range",
              })
              .refine((value) => value.formula != null || value.value != null, {
                message: "Range write requires a value or formula",
              }),
          ]),
        )
        .min(1)
        .describe("写入操作列表，支持离散单元格和连续范围"),
    }),
  },
  clearCells: {
    description:
      "清空单元格内容，不修改单元格的非内容属性。使用 operations 数组，cell 用于清空离散单格，range 用于清空连续区域。行号和列号都从 1 开始；如果要写入内容，请使用 writeCells。",
    needsRunContext: true,
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
} satisfies Record<string, ExcelToolSpec>;

export type ExcelToolName = keyof typeof excelToolSpecs;
