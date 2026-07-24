import { type ToolSet, tool } from "ai";
import type { AgentToolDefinition, AgentToolExecutionOptions, ToolExecutor } from "../contracts.js";

export interface ToolAdapterHooks {
  onToolStart?: (event: {
    toolName: string;
    toolCallId: string;
    input: unknown;
  }) => void | Promise<void>;
  onToolFinish?: (event: {
    toolName: string;
    toolCallId: string;
    input: unknown;
    output?: unknown;
    error?: unknown;
  }) => void | Promise<void>;
}

export function createAgentToolSet(
  definitions: readonly AgentToolDefinition[],
  executor: ToolExecutor,
  executionContext: unknown,
  hooks: ToolAdapterHooks = {},
): ToolSet {
  const tools = Object.fromEntries(
    definitions.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: async (input: unknown, options: any) => {
          const toolCallId = String(options?.toolCallId ?? "unknown-tool-call");
          await hooks.onToolStart?.({
            toolName: definition.name,
            toolCallId,
            input,
          });

          const executionOptions: AgentToolExecutionOptions = {
            toolCallId,
            abortSignal: options?.abortSignal,
            context: executionContext,
          };

          try {
            const output = await executor.execute(definition.name, input, executionOptions);
            await hooks.onToolFinish?.({
              toolName: definition.name,
              toolCallId,
              input,
              output,
            });
            return output;
          } catch (error) {
            await hooks.onToolFinish?.({
              toolName: definition.name,
              toolCallId,
              input,
              error,
            });
            throw error;
          }
        },
      } as any),
    ]),
  );

  return tools as ToolSet;
}
