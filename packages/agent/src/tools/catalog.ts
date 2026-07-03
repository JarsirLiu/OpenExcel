import { excelToolSpecs, type ExcelToolName, type ExcelToolSpec } from "./schema.js";

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
