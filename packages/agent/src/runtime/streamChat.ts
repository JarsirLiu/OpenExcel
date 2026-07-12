globalThis.AI_SDK_LOG_WARNINGS = false;

import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type TimeoutConfiguration,
  type ToolSet,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { createChatModel, type ModelConfig } from "../model.js";
import {
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  trimMessagesToContextWindow,
} from "../session/contextWindow.js";
import { formatAIError } from "./formatAIError.js";

export interface StreamChatInput {
  modelConfig: ModelConfig;
  systemPrompt: string;
  messages: any[];
  tools: ToolSet;
  toolsContext?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: TimeoutConfiguration<ToolSet>;
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  onStepFinish?: (...args: any[]) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
  onEnd?: ({ messages }: { messages: any[] }) => void | Promise<void>;
}

export function removeEmptyAssistantMessages(messages: any[]): any[] {
  return messages.filter(
    (message) =>
      !(
        message?.role === "assistant" &&
        Array.isArray(message.parts) &&
        message.parts.length === 0
      ),
  );
}

export async function streamChat(
  input: StreamChatInput,
): Promise<ReturnType<typeof toUIMessageStream>> {
  const normalizedMessages = removeEmptyAssistantMessages(input.messages);
  const contextWindow = trimMessagesToContextWindow(normalizedMessages, {
    contextWindowTokens: input.contextWindowTokens,
    outputReserveTokens: input.outputReserveTokens,
    systemPrompt: input.systemPrompt,
  });
  const validatedMessages = await validateUIMessages({
    messages: contextWindow.messages,
    tools: input.tools as any,
  });

  const result = streamText({
    model: createChatModel(input.modelConfig),
    system: input.systemPrompt,
    messages: await convertToModelMessages(validatedMessages as any),
    tools: input.tools as any,
    toolsContext: input.toolsContext as any,
    stopWhen: isLoopFinished(),
    maxOutputTokens: input.outputReserveTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS,
    maxRetries: input.maxRetries ?? 2,
    timeout: input.timeout ?? { totalMs: 120_000, chunkMs: 30_000 },
    abortSignal: input.abortSignal,
    onStepFinish: input.onStepFinish,
    onFinish: async ({ text }: any) => {
      await input.onFinish?.({ text });
    },
    onAbort: async () => {
      await input.onAbort?.();
    },
    onError: async (error: any) => {
      await input.onError?.(error);
    },
  });

  return toUIMessageStream({
    stream: result.stream,
    originalMessages: validatedMessages,
    onError: (error) => formatAIError(error),
    onEnd: async ({ messages }) => {
      await input.onEnd?.({ messages });
    },
  });
}
