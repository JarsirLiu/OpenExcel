import { type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import {
  type RunToolContext,
  runToolContextSchema,
  type WorkspaceToolContext,
  workspaceToolContextSchema,
} from "./context.js";
import type { ServerToolRuntimeDefinition } from "./serverTool.js";

export type ServerToolRegistry = {
  [Name in ExcelToolName]: ServerToolRuntimeDefinition;
};

export type ToolContextMap = Record<ExcelToolName, WorkspaceToolContext | RunToolContext>;

type ToolNames<T extends readonly ServerToolRuntimeDefinition[]> = T[number]["name"];

type DuplicateToolNames<
  T extends readonly ServerToolRuntimeDefinition[],
  Seen extends ExcelToolName = never,
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends ServerToolRuntimeDefinition
    ? Head["name"] extends Seen
      ? Head["name"]
      : Tail extends readonly ServerToolRuntimeDefinition[]
        ? DuplicateToolNames<Tail, Seen | Head["name"]>
        : never
    : never
  : never;

type CompleteToolManifest<T extends readonly ServerToolRuntimeDefinition[]> =
  Exclude<ExcelToolName, ToolNames<T>> extends never
    ? Exclude<ToolNames<T>, ExcelToolName> extends never
      ? DuplicateToolNames<T> extends never
        ? unknown
        : never
      : never
    : never;

export function createServerToolRegistry<const T extends readonly ServerToolRuntimeDefinition[]>(
  manifest: T & CompleteToolManifest<T>,
): ServerToolRegistry {
  const byName = new Map<ExcelToolName, ServerToolRuntimeDefinition>();

  for (const tool of manifest) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate server tool registration: ${tool.name}`);
    }
    const spec = excelToolSpecs[tool.name];
    if (
      tool.description !== spec.description ||
      tool.inputSchema !== spec.inputSchema ||
      tool.outputSchema !== spec.outputSchema
    ) {
      throw new Error(`Server tool contract mismatch: ${tool.name}`);
    }
    if (
      !tool.resultBudget ||
      !Number.isInteger(tool.resultBudget.maxTokens) ||
      tool.resultBudget.maxTokens <= 0 ||
      typeof tool.resultBudget.compact !== "function"
    ) {
      throw new Error(`Server tool result budget contract mismatch: ${tool.name}`);
    }
    const expectedContextScope = spec.needsRunContext ? "run" : "workspace";
    const expectedContextSchema = spec.needsRunContext
      ? runToolContextSchema
      : workspaceToolContextSchema;
    if (
      tool.contextScope !== expectedContextScope ||
      tool.contextSchema !== expectedContextSchema
    ) {
      throw new Error(
        `Server tool context contract mismatch: ${tool.name}; expected=${expectedContextScope}`,
      );
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
    contexts[name] = excelToolSpecs[name].needsRunContext
      ? runToolContextSchema.parse({ workspaceId, runId })
      : workspaceToolContextSchema.parse({ workspaceId });
  }
  return contexts;
}
