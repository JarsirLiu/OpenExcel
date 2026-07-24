globalThis.AI_SDK_LOG_WARNINGS = false;

import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type ToolSet,
  validateUIMessages,
} from "ai";
import { resolveModelForPurpose } from "../../model.js";
import { compactMessagesIfNeeded } from "../../session/compaction.js";
import {
  DEFAULT_MAX_CONVERSATION_TURNS,
  DEFAULT_MAX_USER_INPUT_TOKENS,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  trimMessagesToContextWindow,
} from "../../session/contextWindow.js";
import { removeEmptyAssistantMessages } from "../../session/transcript.js";
import type {
  AgentRunCompletion,
  AgentRunnerInput,
  AgentRunResult,
  AgentTranscriptMessage,
} from "../contracts.js";
import { formatAIError } from "../errors/formatAIError.js";
import { createAgentEventEmitter } from "../events/events.js";
import { convertChatReferenceDataPart } from "../stream/referencePart.js";
import { createUIStreamAdapter } from "../stream/uiStreamAdapter.js";
import { createAgentToolSet } from "../tools/toolAdapter.js";

export interface AgentLoopInput extends Omit<AgentRunnerInput, "workspace" | "transcript"> {
  transcript: AgentTranscriptMessage[];
  systemPrompt: string;
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const normalizedMessages = removeEmptyAssistantMessages(input.transcript);

  const messagesForContext = normalizedMessages;
  // TODO: compaction 实现缺少 token 阈值触发、工具结果截断、checkpoint 持久化和恢复保护，
  // 目前先禁用，仅使用 contextWindow 截断。后续按 eve 的多级压缩策略完整实现。
  if (input.compaction?.enabled === true) {
    throw new Error(
      "Compaction is not fully implemented: token-threshold trigger, tool-result capping, " +
        "checkpoint persistence, and resumption guard are missing. " +
        "Use context window truncation instead.",
    );
  }

  const contextWindow = trimMessagesToContextWindow(messagesForContext, {
    contextWindowTokens: input.contextWindowTokens,
    outputReserveTokens: input.outputReserveTokens,
    maxConversationTurns: input.maxConversationTurns ?? DEFAULT_MAX_CONVERSATION_TURNS,
    maxUserInputTokens: input.maxUserInputTokens ?? DEFAULT_MAX_USER_INPUT_TOKENS,
    systemPrompt: input.systemPrompt,
  });
  const createEventEmitter = createAgentEventEmitter({
    eventSink: input.eventSink,
    persistenceBarrier: input.persistenceBarrier,
  });
  const tools = createAgentToolSet(input.tools, input.toolExecutor, input.executionContext, {
    onToolStart: async (event) => {
      await createEventEmitter.emit("tool.started", event);
    },
    onToolFinish: async (event) => {
      await createEventEmitter.emit("tool.finished", event);
    },
  });
  const validatedMessages = await validateUIMessages({
    messages: contextWindow.messages as any,
    tools: tools as any,
  });
  const persistenceMessages = await validateUIMessages({
    messages: normalizedMessages as any,
    tools: tools as any,
  });
  await createEventEmitter.emit("run.started", {
    droppedMessages: contextWindow.droppedMessages,
    droppedTurns: contextWindow.droppedTurns,
  });

  let resolveCompletion!: (completion: AgentRunCompletion) => void;
  const completion = new Promise<AgentRunCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  let terminal = false;
  let loopError: unknown;
  const finish = (value: AgentRunCompletion) => {
    if (terminal) return;
    terminal = true;
    resolveCompletion(value);
  };

  const result = streamText({
    model: resolveModelForPurpose(input.modelConfig, "chat"),
    system: input.systemPrompt,
    messages: await convertToModelMessages(validatedMessages as any, {
      convertDataPart: convertChatReferenceDataPart,
    }),
    tools: tools as ToolSet,
    prepareStep: input.prepareStep as any,
    stopWhen: isLoopFinished(),
    maxOutputTokens: input.outputReserveTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS,
    maxRetries: input.maxRetries ?? 2,
    timeout: (input.timeout ?? { totalMs: 120_000, chunkMs: 30_000 }) as any,
    abortSignal: input.abortSignal,
    onStepFinish: async (step: any) => {
      await createEventEmitter.emit("step.finished", step);
      await input.onStepFinish?.(step);
    },
    onFinish: async ({ text }: any) => {
      await input.onFinish?.({ text });
    },
    onAbort: async (event: any) => {
      await input.onAbort?.(event);
    },
    onError: async (error: unknown) => {
      loopError = error;
      await input.onError?.(error);
    },
  });

  const stream = createUIStreamAdapter({
    stream: result.stream,
    tools,
    originalMessages: persistenceMessages as unknown as AgentTranscriptMessage[],
    onEnd: async ({ messages, isAborted }) => {
      const failed = !isAborted && loopError !== undefined;
      try {
        await createEventEmitter.emit(
          failed ? "run.failed" : isAborted ? "run.cancelled" : "run.completed",
          {
            error: failed ? formatAIError(loopError) : undefined,
            isAborted,
            messageCount: messages.length,
          },
        );
        await input.onEnd?.({ messages: messages as AgentTranscriptMessage[], isAborted });

        finish({
          status: failed ? "failed" : isAborted ? "cancelled" : "completed",
          text: failed ? undefined : await result.text,
          error: failed ? loopError : undefined,
          messages: messages as AgentTranscriptMessage[],
          isAborted,
        });
      } catch (error) {
        loopError = error;
        finish({
          status: "failed",
          error,
          messages: messages as AgentTranscriptMessage[],
          isAborted: false,
        });
        throw error;
      }
    },
  });

  void Promise.resolve(result.text).catch(async (error: unknown) => {
    if (terminal) return;
    await createEventEmitter.emit("run.failed", { error: formatAIError(error) });
    await input.onError?.(error);
    finish({ status: "failed", error, isAborted: false });
  });

  return { stream, completion };
}
