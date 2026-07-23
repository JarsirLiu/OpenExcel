import type { TimeoutConfiguration, ToolSet } from "ai";
import type { ModelConfig } from "../model.js";
import { runAgentLoop } from "./agentLoop.js";
import type { AgentTranscriptMessage } from "./contracts.js";
import { formatAIError } from "./formatAIError.js";

export interface StreamChatInput {
  modelConfig: ModelConfig;
  systemPrompt: string;
  messages: AgentTranscriptMessage[];
  tools: ToolSet;
  toolsContext?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: TimeoutConfiguration<any>;
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  maxConversationTurns?: number;
  maxUserInputTokens?: number;
  prepareStep?: (...args: any[]) => unknown;
  onStepFinish?: (...args: any[]) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
  onEnd?: (event: {
    messages: AgentTranscriptMessage[];
    isAborted: boolean;
  }) => void | Promise<void>;
}

export function removeEmptyAssistantMessages(
  messages: AgentTranscriptMessage[],
): AgentTranscriptMessage[] {
  return messages.filter(
    (message) =>
      !(message.role === "assistant" && Array.isArray(message.parts) && message.parts.length === 0),
  );
}

/** Package-local bridge. New server code must use AgentRunner instead. */
export async function streamChat(input: StreamChatInput): Promise<ReadableStream<any>> {
  const definitions = Object.entries(input.tools).map(([name, tool]) => ({
    name,
    description: typeof tool.description === "string" ? tool.description : name,
    inputSchema: (tool as any).inputSchema,
  }));
  const result = await runAgentLoop({
    ...input,
    transcript: input.messages,
    tools: definitions,
    toolExecutor: {
      execute: async (toolName, toolInput, options) => {
        const target = input.tools[toolName];
        if (!target || typeof target.execute !== "function") {
          throw new Error(`Tool ${toolName} is not executable`);
        }
        return target.execute(
          toolInput as never,
          {
            toolCallId: options.toolCallId,
            abortSignal: options.abortSignal,
            context: input.toolsContext?.[toolName],
          } as never,
        );
      },
    },
    executionContext: input.toolsContext,
  });
  return result.stream;
}

export { convertChatReferenceDataPart } from "./agentLoop.js";
export { formatAIError };
