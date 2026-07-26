import type { z } from "zod";
import { EXCEL_TOOL_CAPABILITY_BOUNDARY } from "./capabilities.js";
import { type ExcelToolName, excelToolSpecs } from "./excelToolContract.js";

export type ExcelToolDefinition = {
  name: ExcelToolName;
  description: string;
  inputSchema: z.ZodTypeAny;
};

export function buildExcelToolDefinitions(
  names: readonly ExcelToolName[] = Object.keys(excelToolSpecs) as ExcelToolName[],
): ExcelToolDefinition[] {
  return names.map((name) => {
    const tool = excelToolSpecs[name];
    return {
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  });
}

export function buildExcelToolCatalog(
  names: readonly ExcelToolName[] = Object.keys(excelToolSpecs) as ExcelToolName[],
): string {
  const tools = names
    .map((name) => `- **${name}**: ${excelToolSpecs[name].description}`)
    .join("\n");

  return `${tools}\n\n## 能力边界\n\n${EXCEL_TOOL_CAPABILITY_BOUNDARY}`;
}
