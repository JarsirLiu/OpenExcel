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

export interface StreamChatInput {
  modelConfig: ModelConfig;
  systemPrompt: string;
  messages: any[];
  tools: ToolSet;
  toolsContext?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: TimeoutConfiguration<ToolSet>;
  onStepFinish?: (...args: any[]) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
  onEnd?: ({ messages }: { messages: any[] }) => void | Promise<void>;
}

export async function streamChat(
  input: StreamChatInput,
): Promise<ReturnType<typeof toUIMessageStream>> {
  const validatedMessages = await validateUIMessages({
    messages: input.messages,
    tools: input.tools as any,
  });

  const result = streamText({
    model: createChatModel(input.modelConfig),
    system: input.systemPrompt,
    messages: await convertToModelMessages(validatedMessages as any),
    tools: input.tools as any,
    toolsContext: input.toolsContext as any,
    stopWhen: isLoopFinished(),
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
    onError: (error) => {
      console.error("[agent] AI stream error:", error);
      return "AI 服务暂时不可用，请稍后重试";
    },
    onEnd: async ({ messages }) => {
      await input.onEnd?.({ messages });
    },
  });
}
