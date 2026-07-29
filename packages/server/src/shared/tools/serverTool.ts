import type { ToolResultPolicy } from "@openexcel/agent";
import { type ExcelToolInput, type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import type { z } from "zod";
import type { Prisma } from "../../infra/database/prismaTypes.js";
import {
  type RunToolContext,
  runToolContextSchema,
  type WorkspaceToolContext,
  workspaceToolContextSchema,
} from "./context.js";

export type ToolResultBudgetContext = {
  maxTokens: number;
};

export type ServerToolExecutionOptions<Context> = {
  context: Context;
  db?: Prisma.TransactionClient;
  toolCallId?: string;
  abortSignal?: AbortSignal;
  resultBudget?: ToolResultBudgetContext;
};

export type ServerToolContext<Name extends ExcelToolName> =
  (typeof excelToolSpecs)[Name]["needsRunContext"] extends true
    ? RunToolContext
    : WorkspaceToolContext;

type ServerToolOutput<Name extends ExcelToolName> = z.output<
  (typeof excelToolSpecs)[Name]["outputSchema"]
>;

export type ServerToolDefinition<Name extends ExcelToolName = ExcelToolName> = {
  name: Name;
  description: (typeof excelToolSpecs)[Name]["description"];
  inputSchema: (typeof excelToolSpecs)[Name]["inputSchema"];
  contextScope: "run" | "workspace";
  contextSchema: z.ZodTypeAny;
  outputSchema: (typeof excelToolSpecs)[Name]["outputSchema"];
  resultBudget: ToolResultPolicy;
  execute(
    input: ExcelToolInput<Name>,
    options: ServerToolExecutionOptions<ServerToolContext<Name>>,
  ): Promise<ServerToolOutput<Name>>;
};

/** Runtime view used after a heterogeneous manifest has been validated. */
export type ServerToolRuntimeDefinition = {
  name: ExcelToolName;
  description: string;
  inputSchema: z.ZodTypeAny;
  contextScope: "run" | "workspace";
  contextSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  resultBudget: ToolResultPolicy;
  execute(input: unknown, options: ServerToolExecutionOptions<unknown>): Promise<unknown>;
};

type ServerToolConfig<Name extends ExcelToolName> = {
  resultBudget: Omit<ToolResultPolicy, "validate">;
  execute: (
    input: ExcelToolInput<Name>,
    options: ServerToolExecutionOptions<ServerToolContext<Name>>,
  ) => Promise<ServerToolOutput<Name>>;
};

export function defineServerTool<const Name extends ExcelToolName>(
  name: Name,
  config: ServerToolConfig<Name>,
): ServerToolDefinition<Name> {
  const spec = excelToolSpecs[name];
  return {
    name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    contextScope: spec.needsRunContext ? "run" : "workspace",
    contextSchema: spec.needsRunContext ? runToolContextSchema : workspaceToolContextSchema,
    outputSchema: spec.outputSchema,
    resultBudget: {
      ...config.resultBudget,
      validate: (value) => spec.outputSchema.safeParse(value).success,
    },
    execute: config.execute,
  };
}
