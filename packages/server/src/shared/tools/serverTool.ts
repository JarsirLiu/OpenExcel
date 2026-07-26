import { type ExcelToolInput, type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import type { z } from "zod";

export type ToolResultBudgetContext = {
  maxTokens: number;
  policy: "generic" | "paged-structured";
};

export type ServerToolExecutionOptions<Context> = {
  context: Context;
  toolCallId?: string;
  abortSignal?: AbortSignal;
  resultBudget?: ToolResultBudgetContext;
};

export type ServerToolDefinition<Name extends ExcelToolName = ExcelToolName, Output = unknown> = {
  name: Name;
  description: string;
  inputSchema: z.ZodTypeAny;
  contextSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  execute: (input: unknown, options?: unknown) => Promise<Output>;
};

type ServerToolConfig<Context, Output, Name extends ExcelToolName> = {
  contextSchema: z.ZodType<Context>;
  outputSchema: z.ZodTypeAny;
  execute: (
    input: ExcelToolInput<Name>,
    options: ServerToolExecutionOptions<Context>,
  ) => Promise<Output>;
};

export function defineServerTool<const Name extends ExcelToolName, Context, Output>(
  name: Name,
  config: ServerToolConfig<Context, Output, Name>,
): ServerToolDefinition<Name, Output> {
  const spec = excelToolSpecs[name];
  return {
    name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    contextSchema: config.contextSchema,
    outputSchema: config.outputSchema,
    execute: async (input, options) => {
      const executionOptions =
        options && typeof options === "object"
          ? (options as ServerToolExecutionOptions<unknown>)
          : { context: undefined };
      return config.execute(input as ExcelToolInput<Name>, {
        ...executionOptions,
        context: executionOptions.context as Context,
      });
    },
  };
}
