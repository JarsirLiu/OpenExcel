import { type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import {
  type RunToolContext,
  runToolContextSchema,
  type WorkspaceToolContext,
  workspaceToolContextSchema,
} from "./context.js";
import type { ServerToolDefinition } from "./serverTool.js";

export type ServerToolRegistry = {
  [Name in ExcelToolName]: ServerToolDefinition<Name>;
};

export type ToolContextMap = Record<ExcelToolName, WorkspaceToolContext | RunToolContext>;

export function createServerToolRegistry(
  manifest: readonly ServerToolDefinition[],
): ServerToolRegistry {
  const byName = new Map<ExcelToolName, ServerToolDefinition>();

  for (const tool of manifest) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate server tool registration: ${tool.name}`);
    }
    const spec = excelToolSpecs[tool.name];
    if (tool.description !== spec.description || tool.inputSchema !== spec.inputSchema) {
      throw new Error(`Server tool contract mismatch: ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  const expected = Object.keys(excelToolSpecs) as ExcelToolName[];
  const missing = expected.filter((name) => !byName.has(name));
  const extra = [...byName.keys()].filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Server tool registry mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
    );
  }

  return Object.fromEntries(expected.map((name) => [name, byName.get(name)])) as ServerToolRegistry;
}

export function buildToolContexts(workspaceId: number, runId: number): ToolContextMap {
  const contexts = {} as ToolContextMap;
  for (const name of Object.keys(excelToolSpecs) as ExcelToolName[]) {
    contexts[name] =
      "needsRunContext" in excelToolSpecs[name] && excelToolSpecs[name].needsRunContext
        ? runToolContextSchema.parse({ workspaceId, runId })
        : workspaceToolContextSchema.parse({ workspaceId });
  }
  return contexts;
}
