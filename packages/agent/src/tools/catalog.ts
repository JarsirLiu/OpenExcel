import type { AgentToolDefinition } from "../runtime/contracts.js";
import { EXCEL_TOOL_CAPABILITY_BOUNDARY } from "./capabilities.js";
import { type ExcelToolName, type ExcelToolSpec, excelToolSpecs } from "./schema.js";

export function buildExcelToolDefinitions(): AgentToolDefinition[] {
  return Object.entries(excelToolSpecs).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function buildExcelToolCatalog(): string {
  const tools = Object.entries(excelToolSpecs)
    .map(([name, tool]) => `- **${name}**: ${tool.description}`)
    .join("\n");

  return `${tools}\n\n## 能力边界\n\n${EXCEL_TOOL_CAPABILITY_BOUNDARY}`;
}

export function buildWorkspaceToolContext(
  workspaceId: number,
): Record<string, { workspaceId: number }> {
  const entries = Object.entries(excelToolSpecs) as Array<[ExcelToolName, ExcelToolSpec]>;
  return Object.fromEntries(
    entries
      .filter(([, tool]) => tool.needsRunContext !== true)
      .map(([name]) => [name, { workspaceId }]),
  ) as Record<string, { workspaceId: number }>;
}

export function buildRunToolContext(
  runId: number,
  workspaceId: number,
): Record<string, { runId: number; workspaceId: number }> {
  const entries = Object.entries(excelToolSpecs) as Array<[ExcelToolName, ExcelToolSpec]>;
  return Object.fromEntries(
    entries
      .filter(([, tool]) => tool.needsRunContext === true)
      .map(([name]) => [name, { runId, workspaceId }]),
  ) as Record<string, { runId: number; workspaceId: number }>;
}

export function buildExcelToolContext(
  runId: number,
  workspaceId: number,
): Record<string, { runId?: number; workspaceId: number }> {
  return {
    ...buildWorkspaceToolContext(workspaceId),
    ...buildRunToolContext(runId, workspaceId),
  };
}
