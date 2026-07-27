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
import { ModelStepContext } from "../../session/modelStepContext.js";
import { TokenUsageTracker } from "../../session/tokenBudget.js";
import { appendResponseMessages, removeEmptyAssistantMessages } from "../../session/transcript.js";
import { ContextCompactionCoordinator } from "../context/contextCompactionCoordinator.js";
import type { ContextTranscriptEntry } from "../context/transcript.js";
import type {
  AgentRunCompletion,
  AgentRunnerInput,
  AgentRunResult,
  AgentTranscriptMessage,
} from "../contracts.js";
import { isContextOverflowError } from "../errors/isContextOverflowError.js";
import { AgentPersistenceError, createOrderedAgentEventEmitter } from "../events/events.js";
import { convertChatReferenceDataPart } from "../stream/referencePart.js";
import { createAgentStreamBridge } from "./agentStreamBridge.js";
import { createModelStepObserver } from "./modelStepObserver.js";

export interface AgentLoopInput extends Omit<AgentRunnerInput, "workspace" | "transcript"> {
  transcript: ContextTranscriptEntry<AgentTranscriptMessage>[];
  systemPrompt: string;
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const normalizedEntries = input.transcript.filter(
    (entry) =>
      !(
        entry.message.role === "assistant" &&
        Array.isArray(entry.message.parts) &&
        entry.message.parts.length === 0
      ),
  );
  const normalizedMessages = normalizedEntries.map((entry) => entry.message);

  const messagesForContext = normalizedMessages;

  const contextWindow = trimMessagesToContextWindow(messagesForContext, {
    contextWindowTokens: input.contextWindowTokens,
    outputReserveTokens: input.outputReserveTokens,
    maxConversationTurns: input.maxConversationTurns ?? DEFAULT_MAX_CONVERSATION_TURNS,
    maxUserInputTokens: input.maxUserInputTokens ?? DEFAULT_MAX_USER_INPUT_TOKENS,
    systemPrompt: input.systemPrompt,
  });
  const timeout = input.timeout ?? { totalMs: 120_000, toolMs: 120_000 };
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
  let stepIndex = 0;
  const streamBridge = createAgentStreamBridge({
    turnId: input.turnId,
    tools: input.tools,
    toolExecutor: input.toolExecutor,
    executionContext: input.executionContext,
    emitter: createEventEmitter,
    getStepIndex: () => stepIndex,
    onFinish: input.onFinish,
    onAbort: input.onAbort,
    onError: input.onError,
  });
  const tools = streamBridge.tools;
  const convertMessages = async (messages: readonly AgentTranscriptMessage[]) => {
    const validated = await validateUIMessages({
      messages: messages as any,
      tools: tools as any,
    });
    return convertToModelMessages(validated as any, {
      convertDataPart: convertChatReferenceDataPart,
    });
  };
  let activeSystemPrompt = input.systemPrompt;
  let modelMessages: unknown[] = [...(await convertMessages(contextWindow.messages))];
  const model = resolveModelForPurpose(input.modelConfig, "chat");
  const tokenUsageTracker = new TokenUsageTracker();
  let compactionCoordinator: ContextCompactionCoordinator | undefined;
  let lastActiveTools: readonly string[] | undefined;
  if (input.compaction) {
    if (!input.compactionCheckpointStore || !input.compactionContextKey) {
      throw new Error("Context compaction requires a checkpoint store and context key");
    }
    compactionCoordinator = new ContextCompactionCoordinator({
      contextKey: input.compactionContextKey,
      transcript: normalizedEntries,
      initialMessages: contextWindow.messages,
      baseSystemPrompt: input.systemPrompt,
      model,
      tools: input.tools,
      checkpointStore: input.compactionCheckpointStore,
      contextWindowTokens: input.contextWindowTokens ?? 180_000,
      policy: input.compaction,
      externalContextRevision: input.externalContextRevision,
      sourceRunId: input.turnId,
      signal: agentAbortController.signal,
      convertToModelMessages: convertMessages,
      resetTokenBaseline: () => tokenUsageTracker.resetAfterCompaction(),
    });
    const initialContext = await compactionCoordinator.initialize();
    activeSystemPrompt = initialContext.system;
    modelMessages = [...initialContext.messages];
  }
  const validatedMessages = await validateUIMessages({
    messages: contextWindow.messages as any,
    tools: tools as any,
  });
  const persistenceMessages = await validateUIMessages({
    messages: normalizedMessages as any,
    tools: tools as any,
  });
  if (!compactionCoordinator) {
    modelMessages = await convertToModelMessages(validatedMessages as any, {
      convertDataPart: convertChatReferenceDataPart,
    });
  }
  const modelStepContext = new ModelStepContext(modelMessages, activeSystemPrompt, input.tools);
  const modelStepObserver = createModelStepObserver({
    emitter: createEventEmitter,
    tokenUsageTracker,
    modelStepContext,
    onModelStepFinished: async (event) => {
      compactionCoordinator?.recordStepFinished(event);
      await input.onModelStepFinished?.(event);
    },
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
  const finish = (value: AgentRunCompletion) => {
    if (terminal) return;
    terminal = true;
    resolveCompletion(value);
  };

  const prepareStep = async (step: unknown) => {
    const original = (await input.prepareStep?.(step as any)) as
      | Record<string, unknown>
      | undefined;
    const value = step as Record<string, unknown>;
    lastActiveTools = Array.isArray(original?.activeTools)
      ? original.activeTools.map(String)
      : Array.isArray(value.activeTools)
        ? value.activeTools.map(String)
        : undefined;
    if (!compactionCoordinator) return original;
    const compacted = await compactionCoordinator.prepare({
      messages: value.messages,
      instructions: value.instructions ?? activeSystemPrompt,
      activeTools: lastActiveTools,
    });
    if (!compacted) return original;
    activeSystemPrompt = compacted.system;
    modelMessages = [...compacted.messages];
    return { ...original, ...compacted };
  };

  let pendingOverflowError: unknown;
  let compactionRetries = 0;
  const createModelResult = () =>
    streamText({
      model,
      system: activeSystemPrompt,
      messages: modelMessages as any,
      tools: tools as ToolSet,
      prepareStep: prepareStep as any,
      stopWhen: isLoopFinished(),
      maxOutputTokens: input.outputReserveTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS,
      maxRetries: input.maxRetries ?? 2,
      timeout: timeout as any,
      abortSignal: agentAbortController.signal,
      include: {
        requestMessages: true,
      },
      onStepFinish: modelStepObserver.onStepFinish,
      onStepStart: async (step: unknown) => {
        await modelStepObserver.onStepStart(step);
        stepIndex = modelStepObserver.getStepIndex();
      },
      onChunk: async ({ chunk }: { chunk: unknown }) => streamBridge.onChunk(chunk),
      onFinish: streamBridge.onFinish,
      onAbort: streamBridge.onAbort,
      onError: async (event: unknown) => {
        const error =
          event && typeof event === "object" ? (event as Record<string, unknown>).error : event;
        if (compactionCoordinator && isContextOverflowError(error)) {
          pendingOverflowError = error;
          return;
        }
        await streamBridge.onError(event);
      },
    });

  let result: any = createModelResult();

  // Completion drives the durable event stream and waits for all tool steps.
  const baseMessages = persistenceMessages as unknown as AgentTranscriptMessage[];
  void (async () => {
    try {
      // Wait for the full loop, including all tool executions.
      // The AI SDK text promise resolves after all steps finish.
      let text: string;
      let responseMessages: unknown;
      for (;;) {
        try {
          [text, responseMessages] = await Promise.all([
            result.text,
            (result as { responseMessages?: PromiseLike<unknown> }).responseMessages ??
              Promise.resolve(undefined),
          ]);
          break;
        } catch (error) {
          const overflowError = pendingOverflowError ?? error;
          if (
            !compactionCoordinator ||
            !isContextOverflowError(overflowError) ||
            compactionRetries >= (input.compaction?.maxCompactionRetries ?? 0)
          ) {
            throw error;
          }

          const compacted = await compactionCoordinator.prepare(
            {
              messages: modelMessages,
              instructions: activeSystemPrompt,
              activeTools: lastActiveTools,
            },
            true,
          );
          if (!compacted) throw error;
          compactionRetries += 1;
          pendingOverflowError = undefined;
          activeSystemPrompt = compacted.system;
          modelMessages = [...compacted.messages];
          streamBridge.resetForRetry();
          result = createModelResult();
        }
      }
      const streamState = streamBridge.getState();
      const isAborted = streamState.aborted || agentAbortController.signal.aborted;
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
        status: streamState.loopError ? "failed" : isAborted ? "cancelled" : "completed",
        text: streamState.loopError ? undefined : text,
        error: streamState.loopError,
        messages: finalMessages,
        isAborted,
        failurePhase: streamState.loopError ? streamState.failurePhase : undefined,
        failureStepIndex: streamState.loopError ? stepIndex : undefined,
      });
    } catch (error) {
      const streamState = streamBridge.getState();
      const isAborted = streamState.aborted || agentAbortController.signal.aborted;
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
              : (streamState.failurePhase ?? "model"),
        failureStepIndex:
          isAborted && flushError == null
            ? undefined
            : streamState.failurePhase === "model"
              ? stepIndex
              : undefined,
      });
    }
  })();

  return { completion };
}
