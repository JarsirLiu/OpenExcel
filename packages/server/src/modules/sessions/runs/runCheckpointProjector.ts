import type { AgentEvent, AgentTranscriptMessage, ContextTranscriptEntry } from "@openexcel/agent";

type EventPayload = Record<string, unknown>;

type ProjectedPart = {
  firstSequence: number;
  value: Record<string, unknown>;
};

type ProjectedMessage = {
  firstSequence: number;
  parts: Map<string, ProjectedPart>;
};

type TerminalRunStatus = "completed" | "cancelled" | "failed";

function payloadOf(event: AgentEvent): EventPayload | null {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as EventPayload)
    : null;
}

function stringValue(payload: EventPayload | null, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function terminalStatusOf(events: readonly AgentEvent[]): TerminalRunStatus | undefined {
  const event = [...events]
    .sort((left, right) => right.sequence - left.sequence)
    .find(
      (candidate) =>
        candidate.type === "run.completed" ||
        candidate.type === "run.cancelled" ||
        candidate.type === "run.failed",
    );
  return event?.type === "run.completed"
    ? "completed"
    : event?.type === "run.cancelled"
      ? "cancelled"
      : event?.type === "run.failed"
        ? "failed"
        : undefined;
}

function closePendingTools(messages: Map<string, ProjectedMessage>, status: TerminalRunStatus) {
  const errorText = status === "cancelled" ? "工具执行已中断" : "运行已终止，工具结果未完成";
  for (const message of messages.values()) {
    for (const part of message.parts.values()) {
      if (part.value.state !== "input-available" && part.value.state !== "input-streaming") {
        continue;
      }
      part.value.state = "output-error";
      if (part.value.input === undefined) {
        part.value.input = {};
      }
      part.value.errorText = errorText;
    }
  }
}

function assistantMessageId(payload: EventPayload | null) {
  return (
    stringValue(payload, "messageId") ?? `${stringValue(payload, "turnId") ?? "run"}-assistant`
  );
}

function upsertMessage(messages: Map<string, ProjectedMessage>, id: string, sequence: number) {
  const existing = messages.get(id);
  if (existing) return existing;
  const created = { firstSequence: sequence, parts: new Map<string, ProjectedPart>() };
  messages.set(id, created);
  return created;
}

function projectDelta(messages: Map<string, ProjectedMessage>, event: AgentEvent) {
  const payload = payloadOf(event);
  const delta = stringValue(payload, "delta");
  if (delta == null) return;

  const messageId = assistantMessageId(payload);
  const partId =
    stringValue(payload, "partId") ??
    `${messageId}-${event.type === "reasoning.delta" ? "reasoning" : "text"}`;
  const message = upsertMessage(messages, messageId, event.sequence);
  const existing = message.parts.get(partId);
  if (existing) {
    existing.value.text = `${String(existing.value.text ?? "")}${delta}`;
    return;
  }

  message.parts.set(partId, {
    firstSequence: event.sequence,
    value: {
      id: partId,
      type: event.type === "reasoning.delta" ? "reasoning" : "text",
      text: delta,
    },
  });
}

function projectToolEvent(messages: Map<string, ProjectedMessage>, event: AgentEvent) {
  if (event.type !== "tool.started" && event.type !== "tool.finished") return;
  const payload = payloadOf(event);
  const toolCallId = stringValue(payload, "toolCallId");
  const toolName = stringValue(payload, "toolName");
  if (toolCallId == null || toolName == null) return;

  const messageId = assistantMessageId(payload);
  const message = upsertMessage(messages, messageId, event.sequence);
  const partId = `tool-${toolCallId}`;
  const existing = message.parts.get(partId);
  const hasError = payload?.error != null;
  const value = existing?.value ?? {
    id: partId,
    type: `tool-${toolName}`,
    toolCallId,
    state: "input-available",
    input: payload?.input,
  };

  if (event.type === "tool.finished") {
    if (payload?.input !== undefined) value.input = payload.input;
    value.state = hasError ? "output-error" : "output-available";
    if (hasError) {
      const error = payload?.error;
      value.errorText =
        error && typeof error === "object" && typeof (error as EventPayload).message === "string"
          ? (error as EventPayload).message
          : String(error);
    } else value.output = payload?.output;
  }

  message.parts.set(partId, {
    firstSequence: existing?.firstSequence ?? event.sequence,
    value,
  });
}

function orderedUniqueEvents(events: readonly AgentEvent[]) {
  const seen = new Set<number>();
  return [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .filter((event) => {
      if (seen.has(event.sequence)) return false;
      seen.add(event.sequence);
      return true;
    });
}

export function projectStreamedAssistantMessages(
  events: readonly AgentEvent[],
  terminalStatus?: TerminalRunStatus,
): AgentTranscriptMessage[] {
  const messages = new Map<string, ProjectedMessage>();

  for (const event of orderedUniqueEvents(events)) {
    if (event.type === "message.delta" || event.type === "reasoning.delta") {
      projectDelta(messages, event);
    } else {
      projectToolEvent(messages, event);
    }
  }

  const status = terminalStatus ?? terminalStatusOf(events);
  if (status) closePendingTools(messages, status);

  return [...messages.entries()]
    .sort(([, left], [, right]) => left.firstSequence - right.firstSequence)
    .map(([id, message]) => ({
      id,
      role: "assistant",
      parts: [...message.parts.values()]
        .sort((left, right) => left.firstSequence - right.firstSequence)
        .map((part) => part.value),
    }))
    .filter((message) => message.parts.length > 0);
}

function startedUserMessage(events: readonly AgentEvent[]) {
  const event = orderedUniqueEvents(events).find((candidate) => candidate.type === "run.started");
  const payload = payloadOf(event ?? ({} as AgentEvent));
  const message = payload?.userMessage;
  return message && typeof message === "object" ? (message as AgentTranscriptMessage) : null;
}

function containsMessage(
  messages: readonly AgentTranscriptMessage[],
  candidate: AgentTranscriptMessage,
) {
  if (typeof candidate.id !== "string") return false;
  return messages.some((message) => message.id === candidate.id);
}

function mergeProjectedMessages(
  base: AgentTranscriptMessage[],
  projected: AgentTranscriptMessage[],
) {
  for (const next of projected) {
    const messageIndex = base.findIndex((message) => message.id === next.id);
    if (messageIndex < 0) {
      base.push(next);
      continue;
    }

    const current = base[messageIndex];
    if (current.role !== "assistant" || !Array.isArray(current.parts)) {
      base.push(next);
      continue;
    }

    const parts = current.parts.map((part) => ({ ...part })) as Record<string, unknown>[];
    for (const nextPart of Array.isArray(next.parts) ? next.parts : []) {
      const partId =
        typeof nextPart.id === "string"
          ? nextPart.id
          : typeof nextPart.toolCallId === "string"
            ? `tool-${nextPart.toolCallId}`
            : undefined;
      const partIndex =
        partId == null
          ? -1
          : parts.findIndex(
              (part) =>
                part.id === partId ||
                (typeof part.toolCallId === "string" && `tool-${part.toolCallId}` === partId),
            );

      if (partIndex < 0) {
        parts.push(nextPart as Record<string, unknown>);
        continue;
      }

      const currentPart = parts[partIndex];
      if (nextPart.type === "text" || nextPart.type === "reasoning") {
        currentPart.text = `${String(currentPart.text ?? "")}${String(nextPart.text ?? "")}`;
      } else {
        parts[partIndex] = nextPart as Record<string, unknown>;
      }
    }
    base[messageIndex] = { ...current, parts };
  }
  return base;
}

/** Builds the canonical transcript from the same durable events used by history replay. */
export function projectRunTranscript(
  events: readonly AgentEvent[],
  baseTranscript: readonly AgentTranscriptMessage[],
  fallbackTranscript?: AgentTranscriptMessage[],
  terminalStatus?: TerminalRunStatus,
) {
  const base = [...baseTranscript];
  const userMessage = startedUserMessage(events);
  if (userMessage && !containsMessage(base, userMessage)) base.push(userMessage);

  const streamed = projectStreamedAssistantMessages(events, terminalStatus);
  return streamed.length > 0
    ? mergeProjectedMessages(base, streamed)
    : (fallbackTranscript ?? base);
}

/** Projects durable events onto the session transcript while preserving stable cursors. */
export function projectRunTranscriptEntries(
  events: readonly AgentEvent[],
  baseTranscript: readonly ContextTranscriptEntry<AgentTranscriptMessage>[],
  fallbackTranscript?: readonly ContextTranscriptEntry<AgentTranscriptMessage>[],
  terminalStatus?: TerminalRunStatus,
): ContextTranscriptEntry<AgentTranscriptMessage>[] {
  const baseMessages = baseTranscript.map((entry) => entry.message);
  const fallbackMessages = fallbackTranscript?.map((entry) => entry.message);
  const projected = projectRunTranscript(events, baseMessages, fallbackMessages, terminalStatus);
  const existingById = new Map(
    baseTranscript.flatMap((entry) => {
      const id = typeof entry.message.id === "string" ? entry.message.id : undefined;
      return id ? [[id, entry] as const] : [];
    }),
  );
  let nextCursor = baseTranscript.at(-1)?.cursor ?? -1;
  return projected.map((message, index) => {
    const id = typeof message.id === "string" ? message.id : undefined;
    const indexed = baseTranscript[index];
    const existing =
      (id ? existingById.get(id) : undefined) ??
      (indexed?.message.role === message.role ? indexed : undefined);
    if (existing) return { cursor: existing.cursor, message };
    nextCursor += 1;
    return { cursor: nextCursor, message };
  });
}

export function projectRunCheckpoint(
  events: readonly AgentEvent[],
  transcript: unknown[],
  base?: Pick<
    import("./checkpointRepository.js").RunCheckpoint,
    "checkpointSequence" | "reasoning" | "toolState"
  >,
) {
  let reasoning = base?.reasoning ?? "";
  const toolState: unknown[] = [...(base?.toolState ?? [])];
  for (const event of orderedUniqueEvents(events)) {
    const payload = payloadOf(event);
    if (event.type === "reasoning.delta") {
      const delta = stringValue(payload, "delta");
      if (delta != null) reasoning += delta;
    }
    if (event.type === "tool.started" || event.type === "tool.finished") {
      toolState.push({ type: event.type, payload: event.payload });
    }
  }

  return {
    checkpointSequence: events.reduce(
      (max, event) => Math.max(max, event.sequence),
      base?.checkpointSequence ?? -1,
    ),
    transcript,
    reasoning,
    toolState,
  };
}
