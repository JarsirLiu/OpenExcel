import { type ExcelToolName, type ExcelToolSpec, excelToolSpecs } from "./schema.js";

export function buildExcelToolCatalog(): string {
  return Object.entries(excelToolSpecs)
    .map(([name, tool]) => `- **${name}**: ${tool.description}`)
    .join("\n");
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
