import { type ToolSet, tool } from "ai";
import type { AgentToolDefinition, AgentToolExecutionOptions, ToolExecutor } from "../contracts.js";
import { AgentPersistenceError } from "../events/types.js";
import { toToolError } from "./errors.js";
import { validateToolInput } from "./inputValidation.js";
import { toModelSafeJsonValue } from "./modelSafeJson.js";

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

export interface ToolAdapterOptions {
  validateInput?: boolean;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  const error = new Error("Agent run was cancelled");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error: unknown, signal: AbortSignal | undefined) {
  return signal?.aborted || (error instanceof Error && error.name === "AbortError");
}

function toolErrorResult(error: ReturnType<typeof toToolError>) {
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
  adapterOptions: ToolAdapterOptions = {},
): ToolSet {
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
            throw new Error(`Tool ${definition.name} execution is missing toolCallId`);
          }
          await hooks.onToolStart?.({
            toolName: definition.name,
            toolCallId,
            input,
          });

          if (adapterOptions.validateInput !== false && definition.inputSchema) {
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
              });
              return toolErrorResult(validationResult.error);
            }
            input = validationResult.data;
          }

          const executionOptions: AgentToolExecutionOptions = {
            toolCallId,
            abortSignal: executeOptions?.abortSignal,
            context: executionContext,
          };

          try {
            throwIfAborted(executionOptions.abortSignal);
            const output = toModelSafeJsonValue(
              await executor.execute(definition.name, input, executionOptions),
            );
            await hooks.onToolFinish?.({
              toolName: definition.name,
              toolCallId,
              input,
              output,
            });
            return output;
          } catch (error) {
            if (
              isAbortError(error, executionOptions.abortSignal) ||
              error instanceof AgentPersistenceError
            ) {
              throw error;
            }
            const toolError = toToolError(error);
            await hooks.onToolFinish?.({
              toolName: definition.name,
              toolCallId,
              input,
              error: toolError,
            });
            // A business/tool failure is a model-visible tool result. The
            // model must be allowed to explain the failure or choose another
            // step; only cancellation and persistence failures abort the run.
            return toolErrorResult(toolError);
          }
        },
      } as any),
    ]),
  );

  return tools as ToolSet;
}
