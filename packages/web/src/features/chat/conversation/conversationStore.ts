type ChatMessage = {
  id?: string;
  role?: string;
  parts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

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

  constructor(initialMessages: readonly ChatMessage[] = []) {
    this.#messages = [...initialMessages];
  }

  get messages() {
    return this.#messages;
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

  applyEvent(event: ChatEvent) {
    if (this.#seenEventIds.has(event.eventId)) return;
    this.#seenEventIds.add(event.eventId);

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

    if (event.type === "message.delta" || event.type === "reasoning.delta") {
      this.#applyDelta(event);
      return;
    }

    if (event.type === "tool.started" || event.type === "tool.finished") {
      this.#applyToolEvent(event);
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
    const toolCallId = typeof payload.toolCallId === "string" ? payload.toolCallId : "";
    const toolName = typeof payload.toolName === "string" ? payload.toolName : "";
    if (!toolCallId || !toolName) return;

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
      part.state = payload.error == null ? "output-available" : "output-error";
      if (payload.error == null) part.output = payload.output;
      else part.errorText = String(payload.error);
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function isMessage(value: unknown): value is ChatMessage {
  const message = asRecord(value);
  return typeof message?.id === "string" && typeof message.role === "string";
}

function assistantMessageId(payload: Record<string, unknown> | undefined) {
  if (typeof payload?.messageId === "string") return payload.messageId;
  if (typeof payload?.turnId === "string" && payload.turnId.length > 0) {
    return `${payload.turnId}-assistant`;
  }
  return "assistant-live";
}

function partIdForDelta(event: ChatEvent, payload: Record<string, unknown>) {
  if (typeof payload.partId === "string") return payload.partId;
  return `${assistantMessageId(payload)}-${event.type === "reasoning.delta" ? "reasoning" : "text"}`;
}
