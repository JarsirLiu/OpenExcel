type ChatMessage = {
  id?: string;
  role?: string;
  parts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

import {
  type ContextUsageSnapshot,
  contextUsageFromEvent,
  isNewerContextUsage,
} from "../context/contextUsage";
import type { AutomaticContextCompactionState } from "./automaticContextCompactionStatus";

type ChatEvent = import("../transport/chatEventStream").ChatEvent;

/**
 * Owns the browser's rendered conversation state.
 *
 * The server owns durable AgentEvents and canonical history. This store only
 * accepts the history snapshot or confirmed server AgentEvents. It is the
 * only place where wire events become renderable UI messages.
 */
export class ConversationStore {
  #messages: ChatMessage[];
  #listeners = new Set<() => void>();
  #seenEventIds = new Set<string>();
  #seenEventSequences = new Map<string, Set<number>>();
  #contextUsage: ContextUsageSnapshot | null = null;

  constructor(initialMessages: readonly ChatMessage[] = []) {
    this.#messages = [...initialMessages];
  }

  get messages() {
    return this.#messages;
  }

  get contextUsage() {
    return this.#contextUsage;
  }

  clearContextUsage() {
    this.#contextUsage = null;
    this.#publish();
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  replaceHistory(messages: readonly ChatMessage[]) {
    this.#messages = [...messages];
    this.#seenEventIds.clear();
    this.#seenEventSequences.clear();
    this.#publish();
  }

  setContextUsage(snapshot: ContextUsageSnapshot) {
    if (!isNewerContextUsage(snapshot, this.#contextUsage)) return;
    this.#contextUsage = snapshot;
    this.#publish();
  }

  prependHistory(messages: readonly ChatMessage[]) {
    this.#messages = [...messages, ...this.#messages];
    this.#publish();
  }

  appendOptimisticUserMessage(message: ChatMessage) {
    this.#messages = [...this.#messages, message];
    this.#publish();
  }

  removeOptimisticUserMessage(messageId: string) {
    const index = this.#messages.findIndex((message) => message.id === messageId);
    if (index < 0) throw new Error(`乐观用户消息不存在: ${messageId}`);
    if (this.#messages[index]?.role !== "user") {
      throw new Error(`无法移除非 user 乐观消息: ${messageId}`);
    }
    this.#messages = this.#messages.filter((message) => message.id !== messageId);
    this.#publish();
  }

  applyEvent(event: ChatEvent) {
    if (this.#seenEventIds.has(event.eventId)) return;
    const runKey = event.runId == null ? "unscoped" : String(event.runId);
    const sequences = this.#seenEventSequences.get(runKey) ?? new Set<number>();
    if (sequences.has(event.sequence)) return;
    this.#seenEventIds.add(event.eventId);
    sequences.add(event.sequence);
    this.#seenEventSequences.set(runKey, sequences);

    if (event.type === "run.started") {
      const payload = asRecord(event.payload);
      const userMessage = payload?.userMessage;
      if (
        isMessage(userMessage) &&
        !this.#messages.some((message) => message.id === userMessage.id)
      ) {
        this.#messages = [...this.#messages, userMessage];
        this.#publish();
      }
      return;
    }

    if (event.type === "step.started" || event.type === "step.finished") {
      const snapshot = contextUsageFromEvent(
        event.payload,
        event.occurredAt,
        this.#contextUsage,
        event.runId,
      );
      if (snapshot && isNewerContextUsage(snapshot, this.#contextUsage)) {
        this.#contextUsage = snapshot;
        this.#publish();
      }
      return;
    }

    if (event.type === "context.automatic_compaction.started") {
      this.#applyCompactionEvent(event, "running");
      this.#publish();
      return;
    }

    if (event.type === "context.automatic_compaction.completed") {
      this.#applyCompactionEvent(event, "completed");
      this.#publish();
      return;
    }

    if (event.type === "context.automatic_compaction.failed") {
      this.#applyCompactionEvent(event, "failed");
      this.#publish();
      return;
    }

    if (event.type === "message.delta" || event.type === "reasoning.delta") {
      this.#applyDelta(event);
      return;
    }

    if (event.type === "tool.started" || event.type === "tool.finished") {
      this.#applyToolEvent(event);
      return;
    }

    if (
      event.type === "run.completed" ||
      event.type === "run.cancelled" ||
      event.type === "run.failed"
    ) {
      this.#assertNoRunningAutomaticCompaction();
      this.#closePendingTools(event.type);
    }
  }

  #applyDelta(event: ChatEvent) {
    const payload = asRecord(event.payload) ?? {};
    const delta = typeof payload.delta === "string" ? payload.delta : "";
    if (!delta) return;

    const messageId = assistantMessageId(payload);
    const messageIndex = this.#messages.findIndex((message) => message.id === messageId);
    const message =
      messageIndex >= 0
        ? this.#messages[messageIndex]
        : { id: messageId, role: "assistant", parts: [] };
    const id = partIdForDelta(event, payload);
    const parts = (message.parts ?? []).map((part) => ({ ...part }));
    const part = parts.find((candidate) => candidate.id === id);
    if (part) {
      part.text = `${String(part.text ?? "")}${delta}`;
    } else {
      parts.push({
        id,
        type: event.type === "reasoning.delta" ? "reasoning" : "text",
        text: delta,
      });
    }
    const nextMessage = { ...message, parts };
    this.#messages =
      messageIndex >= 0
        ? this.#messages.map((candidate, index) =>
            index === messageIndex ? nextMessage : candidate,
          )
        : [...this.#messages, nextMessage];
    this.#publish();
  }

  #applyToolEvent(event: ChatEvent) {
    const payload = asRecord(event.payload) ?? {};
    const toolCallId = requiredStringField(payload, "toolCallId");
    const toolName = requiredStringField(payload, "toolName");

    const messageId = assistantMessageId(payload);
    const messageIndex = this.#messages.findIndex((message) => message.id === messageId);
    const message =
      messageIndex >= 0
        ? this.#messages[messageIndex]
        : { id: messageId, role: "assistant", parts: [] };
    const parts = (message.parts ?? []).map((candidate) => ({ ...candidate }));
    const id = `tool-${toolCallId}`;
    const partIndex = parts.findIndex((candidate) => candidate.id === id);
    const part: Record<string, unknown> =
      partIndex >= 0
        ? parts[partIndex]
        : {
            id,
            type: `tool-${toolName}`,
            toolCallId,
            state: "input-available",
            input: payload.input,
          };
    if (event.type === "tool.finished") {
      if (payload.input !== undefined) part.input = payload.input;
      part.state = payload.error == null ? "output-available" : "output-error";
      if (payload.error == null) part.output = payload.output;
      else part.errorText = formatToolError(payload.error);
    }
    if (partIndex >= 0) parts[partIndex] = part;
    else parts.push(part);
    const nextMessage = { ...message, parts };
    this.#messages =
      messageIndex >= 0
        ? this.#messages.map((candidate, index) =>
            index === messageIndex ? nextMessage : candidate,
          )
        : [...this.#messages, nextMessage];
    this.#publish();
  }

  #closePendingTools(type: ChatEvent["type"]): boolean {
    const errorText = type === "run.cancelled" ? "工具执行已中断" : "运行已终止，工具结果未完成";
    let changed = false;
    this.#messages = this.#messages.map((message) => {
      if (message.role !== "assistant" || !Array.isArray(message.parts)) return message;
      let messageChanged = false;
      const parts = message.parts.map((part) => {
        if (!part || (part.state !== "input-available" && part.state !== "input-streaming")) {
          return part;
        }
        messageChanged = true;
        changed = true;
        return { ...part, state: "output-error", errorText };
      });
      return messageChanged ? { ...message, parts } : message;
    });
    if (changed) this.#publish();
    return changed;
  }

  #assertNoRunningAutomaticCompaction() {
    for (const message of this.#messages) {
      if (message.role !== "assistant" || !Array.isArray(message.parts)) continue;
      if (
        message.parts.some(
          (part) => part.type === "automatic-context-compaction" && part.status === "running",
        )
      ) {
        throw new Error(`运行终止前自动压缩未结束: ${message.id ?? "unknown"}`);
      }
    }
  }

  #applyCompactionEvent(event: ChatEvent, status: AutomaticContextCompactionState) {
    const payload = asRecord(event.payload);
    const messageId = requiredStringField(payload, "messageId");
    const compactionId = requiredStringField(payload, "compactionId");
    const messageIndex = this.#messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) {
      throw new Error(`自动压缩事件关联不到 assistant 消息: ${messageId}`);
    }
    const message = this.#messages[messageIndex];
    if (message.role !== "assistant") {
      throw new Error(`上下文压缩事件关联了非 assistant 消息: ${messageId}`);
    }
    const parts = (message.parts ?? []).map((part) => ({ ...part }));
    const partIndex = parts.findIndex((part) => part.id === compactionId);
    if (status === "running") {
      if (partIndex >= 0) throw new Error(`上下文压缩已存在: ${compactionId}`);
      parts.push({ id: compactionId, type: "automatic-context-compaction", status });
    } else {
      if (partIndex < 0) throw new Error(`收到未匹配的上下文压缩事件: ${compactionId}`);
      if (parts[partIndex].type !== "automatic-context-compaction") {
        throw new Error(`上下文压缩 ID 关联了错误的消息 part: ${compactionId}`);
      }
      if (parts[partIndex].status !== "running") {
        throw new Error(`上下文压缩已处于终态: ${compactionId}`);
      }
      parts[partIndex] = { ...parts[partIndex], status };
    }
    const nextMessage = { ...message, parts };
    this.#messages = this.#messages.map((candidate, index) =>
      index === messageIndex ? nextMessage : candidate,
    );
  }

  removeAfterUserMessage(messageId: string) {
    const index = this.#messages.findIndex((message) => message.id === messageId);
    if (index < 0) throw new Error("会话消息与撤销结果不一致，无法更新本地状态");
    this.#messages = this.#messages.slice(0, index);
    this.#publish();
  }

  #publish() {
    for (const listener of this.#listeners) listener();
  }
}

function formatToolError(value: unknown): string {
  if (typeof value === "string") return value;
  if (asRecord(value) && typeof asRecord(value)?.message === "string") {
    return asRecord(value)?.message as string;
  }
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredStringField(value: Record<string, unknown> | undefined, field: string) {
  const result = value?.[field];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`事件缺少 ${field}`);
  }
  return result;
}

function isMessage(value: unknown): value is ChatMessage {
  const message = asRecord(value);
  return typeof message?.id === "string" && typeof message.role === "string";
}

function assistantMessageId(payload: Record<string, unknown> | undefined) {
  const value = payload?.messageId;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("assistant 事件缺少 messageId");
  }
  return value;
}

function partIdForDelta(event: ChatEvent, payload: Record<string, unknown>) {
  const value = payload.partId;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${event.type} 事件缺少 partId`);
  }
  return value;
}
