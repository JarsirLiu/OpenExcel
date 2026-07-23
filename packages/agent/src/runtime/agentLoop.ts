globalThis.AI_SDK_LOG_WARNINGS = false;

import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type ToolSet,
  validateUIMessages,
} from "ai";
import { z } from "zod";
import { createChatModel } from "../model.js";
import {
  DEFAULT_MAX_CONVERSATION_TURNS,
  DEFAULT_MAX_USER_INPUT_TOKENS,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  trimMessagesToContextWindow,
} from "../session/contextWindow.js";
import type {
  AgentRunCompletion,
  AgentRunnerInput,
  AgentRunResult,
  AgentTranscriptMessage,
} from "./contracts.js";
import { createAgentEventEmitter } from "./events.js";
import { formatAIError } from "./formatAIError.js";
import { createAgentToolSet } from "./toolAdapter.js";
import { createUIStreamAdapter } from "./uiStreamAdapter.js";

const positiveIdSchema = z.number().int().positive();
const resolvedChatReferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("workbook"),
    workbookId: positiveIdSchema,
    workbookName: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sheet"),
    workbookId: positiveIdSchema,
    workbookName: z.string().min(1),
    sheetId: positiveIdSchema,
    sheetName: z.string().min(1),
    sheetNo: positiveIdSchema.optional(),
  }),
]);
const unavailableChatReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workbook"), workbookId: positiveIdSchema }),
  z.object({ kind: z.literal("sheet"), sheetId: positiveIdSchema }),
]);
const chatReferenceDataSchema = z.object({
  reference: z.union([resolvedChatReferenceSchema, unavailableChatReferenceSchema]),
  status: z.enum(["resolved", "unavailable"]),
});

export function convertChatReferenceDataPart(part: unknown) {
  if (typeof part !== "object" || part === null) return undefined;
  const record = part as Record<string, unknown>;
  if (record.type !== "data-chat-reference") return undefined;

  const parsed = chatReferenceDataSchema.safeParse(record.data);
  if (!parsed.success) return undefined;

  if (parsed.data.status === "unavailable") {
    const targetId =
      parsed.data.reference.kind === "workbook"
        ? `workbookId=${parsed.data.reference.workbookId}`
        : `sheetId=${parsed.data.reference.sheetId}`;
    return {
      type: "text" as const,
      text: `[用户明确引用的目标已不存在 (${targetId})，不要猜测其他工作簿或 Sheet]`,
    };
  }

  const reference = resolvedChatReferenceSchema.safeParse(parsed.data.reference);
  if (!reference.success) return undefined;

  if (reference.data.kind === "workbook") {
    return {
      type: "text" as const,
      text: `[用户明确引用的工作簿: ${reference.data.workbookName} (workbookId=${reference.data.workbookId})]`,
    };
  }

  const sheetNumber = reference.data.sheetNo == null ? "" : `, sheetNo=${reference.data.sheetNo}`;
  return {
    type: "text" as const,
    text: `[用户明确引用的 Sheet: ${reference.data.workbookName} / ${reference.data.sheetName} (workbookId=${reference.data.workbookId}, sheetId=${reference.data.sheetId}${sheetNumber})]`,
  };
}

function removeEmptyAssistantMessages(
  messages: AgentTranscriptMessage[],
): AgentTranscriptMessage[] {
  return messages.filter(
    (message) =>
      !(message.role === "assistant" && Array.isArray(message.parts) && message.parts.length === 0),
  );
}

export interface AgentLoopInput extends Omit<AgentRunnerInput, "workspace" | "transcript"> {
  transcript: AgentTranscriptMessage[];
  systemPrompt: string;
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const normalizedMessages = removeEmptyAssistantMessages(input.transcript);
  const contextWindow = trimMessagesToContextWindow(normalizedMessages, {
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
    model: createChatModel(input.modelConfig),
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
