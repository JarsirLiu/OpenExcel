globalThis.AI_SDK_LOG_WARNINGS = false;

import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type ToolSet,
  validateUIMessages,
} from "ai";
import { resolveModelForPurpose } from "../../model.js";
import {
  DEFAULT_MAX_CONVERSATION_TURNS,
  DEFAULT_MAX_USER_INPUT_TOKENS,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  trimMessagesToContextWindow,
} from "../../session/contextWindow.js";
import { appendResponseMessages, removeEmptyAssistantMessages } from "../../session/transcript.js";
import type {
  AgentRunCompletion,
  AgentRunnerInput,
  AgentRunResult,
  AgentTranscriptMessage,
} from "../contracts.js";
import { AgentPersistenceError, createOrderedAgentEventEmitter } from "../events/events.js";
import { convertChatReferenceDataPart } from "../stream/referencePart.js";
import { createAgentToolSet } from "../tools/toolAdapter.js";

export interface AgentLoopInput extends Omit<AgentRunnerInput, "workspace" | "transcript"> {
  transcript: AgentTranscriptMessage[];
  systemPrompt: string;
}

function normalizeStepPayload(step: Record<string, unknown>) {
  const toolCalls = Array.isArray(step.toolCalls)
    ? step.toolCalls
        .map((call) => {
          if (!call || typeof call !== "object") return null;
          const value = call as Record<string, unknown>;
          return {
            toolName: String(value.toolName ?? "unknown"),
            toolCallId: String(value.toolCallId ?? "unknown"),
          };
        })
        .filter((call): call is { toolName: string; toolCallId: string } => call !== null)
    : [];
  const toolResults = Array.isArray(step.toolResults)
    ? step.toolResults.map((result) => ({
        isError:
          Boolean(result && typeof result === "object" && "error" in result) ||
          Boolean(
            result && typeof result === "object" && (result as Record<string, unknown>).isError,
          ),
      }))
    : [];

  return {
    stepType: toolCalls.length > 0 ? "tool-call" : toolResults.length > 0 ? "tool-result" : "text",
    finishReason: String(step.finishReason ?? "stop"),
    ...(typeof step.text === "string" ? { text: step.text } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(toolResults.length > 0 ? { toolResults } : {}),
  };
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const normalizedMessages = removeEmptyAssistantMessages(input.transcript);

  const messagesForContext = normalizedMessages;
  // TODO: compaction still lacks token thresholds, tool-result capping, checkpoint persistence,
  // and resume protection; keep it disabled until the full strategy is implemented.
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
  const agentAbortController = new AbortController();
  if (input.abortSignal?.aborted) {
    agentAbortController.abort(input.abortSignal.reason);
  } else {
    input.abortSignal?.addEventListener(
      "abort",
      () => agentAbortController.abort(input.abortSignal?.reason),
      { once: true },
    );
  }
  const createEventEmitter = createOrderedAgentEventEmitter({
    eventSink: input.eventSink,
    persistenceBarrier: input.persistenceBarrier,
    abortController: agentAbortController,
  });
  const emitEvent = (type: Parameters<typeof createEventEmitter.emit>[0], payload: unknown) =>
    createEventEmitter.emit(type, payload);
  // A model run is one assistant turn in the UI. Individual model steps may
  // contribute text, reasoning, and tool parts, but they must not become
  // separate assistant message entities.
  const assistantMessageId = `${input.turnId ?? "run"}-assistant`;
  const tools = createAgentToolSet(input.tools, input.toolExecutor, input.executionContext, {
    onToolStart: async (event) => {
      await createEventEmitter.emit("tool.started", {
        ...event,
        turnId: input.turnId,
        stepIndex,
        messageId: assistantMessageId,
      });
    },
    onToolFinish: async (event) => {
      await createEventEmitter.emit("tool.finished", {
        ...event,
        turnId: input.turnId,
        stepIndex,
        messageId: assistantMessageId,
      });
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
  await emitEvent("run.started", {
    droppedMessages: contextWindow.droppedMessages,
    droppedTurns: contextWindow.droppedTurns,
    userMessage: normalizedMessages.at(-1),
  });

  let resolveCompletion!: (completion: AgentRunCompletion) => void;
  const completion = new Promise<AgentRunCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  let terminal = false;
  let loopError: unknown;
  let streamedText = "";
  let streamedReasoning = "";
  let stepIndex = 0;
  let aborted = false;
  let failurePhase: "model" | "persistence" | undefined;
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
    abortSignal: agentAbortController.signal,
    onStepFinish: async (step: any) => {
      await emitEvent("step.finished", normalizeStepPayload(step));
      await input.onStepFinish?.(step);
    },
    onStepStart: async (step: any) => {
      stepIndex = typeof step?.stepNumber === "number" ? step.stepNumber : stepIndex + 1;
      await emitEvent("step.started", {
        stepNumber: stepIndex,
      });
    },
    onChunk: async ({ chunk }: { chunk: any }) => {
      if (chunk.type === "text-delta") {
        streamedText += chunk.text;
        await emitEvent("message.delta", {
          turnId: input.turnId ?? "unknown",
          stepIndex,
          messageId: assistantMessageId,
          partId: `${input.turnId ?? "run"}-text-${stepIndex}`,
          delta: chunk.text,
          text: streamedText,
        });
      } else if (chunk.type === "reasoning-delta") {
        const delta = chunk.text;
        streamedReasoning += delta;
        await emitEvent("reasoning.delta", {
          turnId: input.turnId ?? "unknown",
          stepIndex,
          messageId: assistantMessageId,
          partId: `${input.turnId ?? "run"}-reasoning-${stepIndex}`,
          delta,
          text: streamedReasoning,
        });
      }
    },
    onFinish: async ({ text }: any) => {
      // Model text generation can finish before tool execution drains.
      await input.onFinish?.({ text });
    },
    onAbort: async (event: any) => {
      aborted = true;
      await input.onAbort?.(event);
    },
    onError: async ({ error }: { error: unknown }) => {
      loopError = error;
      failurePhase = "model";
      await input.onError?.(error);
    },
  });

  // Completion drives the durable event stream and waits for all tool steps.
  const baseMessages = persistenceMessages as unknown as AgentTranscriptMessage[];
  void (async () => {
    try {
      // Wait for the full loop, including all tool executions.
      // The AI SDK text promise resolves after all steps finish.
      const [text, responseMessages] = await Promise.all([
        result.text,
        (result as { responseMessages?: PromiseLike<unknown> }).responseMessages ??
          Promise.resolve(undefined),
      ]);
      const isAborted = aborted || agentAbortController.signal.aborted;
      const messages = appendResponseMessages(baseMessages, responseMessages);
      const finalMessages: AgentTranscriptMessage[] =
        messages.length === persistenceMessages.length &&
        typeof text === "string" &&
        text.length > 0
          ? appendResponseMessages(baseMessages, [
              { role: "assistant", content: [{ type: "text", text }] },
            ])
          : messages;

      await createEventEmitter.flushAndClose();

      finish({
        status: loopError ? "failed" : isAborted ? "cancelled" : "completed",
        text: loopError ? undefined : text,
        error: loopError,
        messages: finalMessages,
        isAborted,
        failurePhase: loopError ? failurePhase : undefined,
        failureStepIndex: loopError ? stepIndex : undefined,
      });
    } catch (error) {
      const isAborted = aborted || agentAbortController.signal.aborted;
      let flushError: unknown;
      try {
        // Abort can reject the SDK promises before queued delta events finish
        // persisting. Completion must not reach server settlement first.
        await createEventEmitter.flushAndClose();
      } catch (errorDuringFlush) {
        flushError = errorDuringFlush;
      }
      try {
        await input.onError?.(error);
      } catch (callbackError) {
        console.error("[agentLoop] onError callback failed:", callbackError);
      }
      finish({
        status: isAborted && flushError == null ? "cancelled" : "failed",
        error: isAborted && flushError == null ? undefined : (flushError ?? error),
        failureKind:
          isAborted && flushError == null
            ? undefined
            : flushError instanceof AgentPersistenceError || error instanceof AgentPersistenceError
              ? "persistence"
              : "execution",
        messages: baseMessages,
        isAborted: isAborted && flushError == null,
        failurePhase:
          isAborted && flushError == null
            ? undefined
            : flushError instanceof AgentPersistenceError || error instanceof AgentPersistenceError
              ? "persistence"
              : (failurePhase ?? "model"),
        failureStepIndex:
          isAborted && flushError == null
            ? undefined
            : failurePhase === "model"
              ? stepIndex
              : undefined,
      });
    }
  })();

  return { completion };
}
