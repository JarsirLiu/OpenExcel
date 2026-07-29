import { type ToolSet, tool } from "ai";
import type { AgentToolDefinition, ToolExecutor } from "../contracts.js";
import { AgentProtocolError } from "../events/types.js";
import { isToolError, ToolConcurrencyError, type ToolError } from "./errors.js";
import { validateToolInput } from "./inputValidation.js";
import { toModelSafeJsonValue } from "./modelSafeJson.js";
import { createToolConcurrencyGate, MAX_PARALLEL_TOOL_CALLS } from "./toolConcurrency.js";

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
    source?: "adapter";
  }) => void | Promise<void>;
}

export type AgentToolSet = ToolSet & {
  resetToolCallBatch: () => void;
};

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  const error = new Error("Agent run was cancelled");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error: unknown, signal: AbortSignal | undefined) {
  return signal?.aborted || (error instanceof Error && error.name === "AbortError");
}

function toolErrorResult(error: ToolError) {
  return {
    isError: true,
    error: {
      kind: error.kind,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(error.retryable != null ? { retryable: error.retryable } : {}),
    },
  };
}

export function createAgentToolSet(
  definitions: readonly AgentToolDefinition[],
  executor: ToolExecutor,
  executionContext: unknown,
  hooks: ToolAdapterHooks = {},
): AgentToolSet {
  const concurrencyGate = createToolConcurrencyGate(MAX_PARALLEL_TOOL_CALLS);
  const tools = Object.fromEntries(
    definitions.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: async (input: unknown, executeOptions: any) => {
          throwIfAborted(executeOptions?.abortSignal);
          const toolCallId = executeOptions?.toolCallId;
          if (typeof toolCallId !== "string" || toolCallId.length === 0) {
            throw new AgentProtocolError(
              `Tool ${definition.name} execution is missing toolCallId`,
              {
                eventType: "tool-call",
                details: { toolName: definition.name },
              },
            );
          }
          await hooks.onToolStart?.({
            toolName: definition.name,
            toolCallId,
            input,
          });

          const releaseConcurrency = concurrencyGate.tryAcquire();
          if (!releaseConcurrency) {
            const error = new ToolConcurrencyError(
              `Too many parallel tool calls. At most ${MAX_PARALLEL_TOOL_CALLS} tool calls may execute at once. Retry this call after the current batch finishes.`,
              {
                maxParallelToolCalls: MAX_PARALLEL_TOOL_CALLS,
                toolName: definition.name,
                toolCallId,
              },
            );
            await hooks.onToolFinish?.({
              toolName: definition.name,
              toolCallId,
              input,
              error,
              source: "adapter",
            });
            return toolErrorResult(error);
          }

          try {
            const validationResult = validateToolInput(
              definition.inputSchema,
              input,
              definition.name,
            );
            if (!validationResult.success && validationResult.error) {
              await hooks.onToolFinish?.({
                toolName: definition.name,
                toolCallId,
                input,
                error: validationResult.error,
                source: "adapter",
              });
              return toolErrorResult(validationResult.error);
            }
            input = validationResult.data;

            const executionOptions = {
              toolName: definition.name,
              toolCallId,
              input,
              abortSignal: executeOptions?.abortSignal,
              context: executionContext,
            };

            let finished = false;
            const finish = async (event: { output?: unknown; error?: unknown }) => {
              if (finished) return;
              finished = true;
              await hooks.onToolFinish?.({
                toolName: definition.name,
                toolCallId,
                input,
                ...event,
                source: "adapter",
              });
            };

            try {
              throwIfAborted(executionOptions.abortSignal);
              const output = toModelSafeJsonValue(await executor.execute(executionOptions));
              await finish({ output });
              return output;
            } catch (error) {
              const cancelled = isAbortError(error, executionOptions.abortSignal);
              if (cancelled) {
                await finish({ error: { kind: "cancelled", message: "工具执行已中断" } });
                throw error;
              }
              await finish({ error });
              if (!isToolError(error)) throw error;
              return toolErrorResult(error);
            }
          } finally {
            releaseConcurrency();
          }
        },
      } as any),
    ]),
  );

  Object.defineProperty(tools, "resetToolCallBatch", {
    value: () => concurrencyGate.resetBatch(),
    enumerable: false,
  });
  return tools as AgentToolSet;
}
