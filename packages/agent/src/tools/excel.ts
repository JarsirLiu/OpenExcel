import { z } from "zod";

export type ExcelToolSpec = {
  description: string;
  inputSchema: z.ZodTypeAny;
  needsRunContext?: boolean;
};

export const sheetMutationContextSchema = z.object({
  runId: z.coerce.number().int().positive(),
});

export type SheetMutationContext = z.infer<typeof sheetMutationContextSchema>;

export const excelToolSpecs = {
  readSheet: {
    description: "读取指定 Sheet 的全部数据，返回结构化表格信息，包含标题行、行/列数、数据二维数组、以及合并单元格信息。行号和列号按 Excel 视觉顺序从 1 开始；data 数组的第一项对应第 1 行。",
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
    }),
  },
  writeCells: {
    description: "批量写入单元格数据。使用 operations 数组，支持两种操作：cell 用于离散单格写入，range 用于连续区域填充同一个值。行号和列号都从 1 开始；如果要清空内容，请使用 clearCells。",
    needsRunContext: true,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z.array(z.discriminatedUnion("type", [
        z.object({
          type: z.literal("cell"),
          row: z.coerce.number().positive().describe("行号，从 1 开始"),
          col: z.coerce.number().positive().describe("列号，从 1 开始"),
          value: z.string().describe("写入的值"),
        }),
        z.object({
          type: z.literal("range"),
          startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
          startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
          endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
          endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
          value: z.string().describe("写入的值"),
        }).refine((value) => value.endRow >= value.startRow && value.endCol >= value.startCol, {
          message: "Invalid sheet range",
        }),
      ])).min(1).describe("写入操作列表，支持离散单元格和连续范围"),
    }),
  },
  clearCells: {
    description: "清空单元格内容。使用 operations 数组，cell 用于清空离散单格，range 用于清空连续区域。行号和列号都从 1 开始；如果要写入内容，请使用 writeCells。",
    needsRunContext: true,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z.array(z.discriminatedUnion("type", [
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
      ])).min(1).describe("清空操作列表，支持离散单元格和连续范围"),
    }),
  },
  mergeCells: {
    description: "合并指定范围的单元格。使用 operations 数组，每项都是一个 range；合并后只有左上角单元格保留值，其余格子的值会被清除。行号和列号都从 1 开始。",
    needsRunContext: true,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z.array(z.object({
        type: z.literal("range"),
        startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
        startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
        endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
        endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
      })).min(1).describe("要合并的范围列表，行号和列号都从 1 开始"),
    }),
  },
  unmergeCells: {
    description: "取消指定范围内的单元格合并。使用 operations 数组，每项都是一个 range；取消后每个单元格独立。行号和列号都从 1 开始。",
    needsRunContext: true,
    inputSchema: z.object({
      sheetId: z.coerce.number().describe("Sheet ID"),
      operations: z.array(z.object({
        type: z.literal("range"),
        startRow: z.coerce.number().positive().describe("起始行号，从 1 开始"),
        startCol: z.coerce.number().positive().describe("起始列号，从 1 开始"),
        endRow: z.coerce.number().positive().describe("结束行号，从 1 开始"),
        endCol: z.coerce.number().positive().describe("结束列号，从 1 开始"),
      })).min(1).describe("要取消合并的范围列表，行号和列号都从 1 开始"),
    }),
  },
} satisfies Record<string, ExcelToolSpec>;

export type ExcelToolName = keyof typeof excelToolSpecs;

export function buildExcelToolCatalog(): string {
  return Object.entries(excelToolSpecs)
    .map(([name, tool]) => `- **${name}**: ${tool.description}`)
    .join("\n");
}

export function buildExcelToolContext(runId: number): Record<string, { runId: number }> {
  const entries = Object.entries(excelToolSpecs) as Array<[ExcelToolName, ExcelToolSpec]>;
  return Object.fromEntries(
    entries
      .filter(([, tool]) => tool.needsRunContext === true)
      .map(([name]) => [name, { runId }]),
  ) as Record<string, { runId: number }>;
}
