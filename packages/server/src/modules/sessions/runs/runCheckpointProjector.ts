import type { AgentEvent, AgentTranscriptMessage } from "@openexcel/agent";

type StreamedPart = {
  messageId: string;
  partId: string;
  type: "text" | "reasoning";
  sequence: number;
  text: string;
};

function streamedPart(event: AgentEvent): StreamedPart | null {
  if (event.type !== "message.delta" && event.type !== "reasoning.delta") return null;
  if (!event.payload || typeof event.payload !== "object") return null;

  const payload = event.payload as {
    delta?: unknown;
    messageId?: unknown;
    partId?: unknown;
  };
  if (typeof payload.delta !== "string" || typeof payload.messageId !== "string") return null;

  const partId =
    typeof payload.partId === "string" ? payload.partId : `${payload.messageId}-${event.type}`;
  return {
    messageId: payload.messageId,
    partId,
    type: event.type === "reasoning.delta" ? "reasoning" : "text",
    sequence: event.sequence,
    text: payload.delta,
  };
}

export function projectStreamedAssistantMessages(
  events: readonly AgentEvent[],
): AgentTranscriptMessage[] {
  const messages = new Map<
    string,
    {
      firstSequence: number;
      parts: Map<string, { firstSequence: number; type: "text" | "reasoning"; text: string }>;
    }
  >();

  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    const part = streamedPart(event);
    if (!part) continue;
    const message = messages.get(part.messageId) ?? {
      firstSequence: part.sequence,
      parts: new Map(),
    };
    const existingPart = message.parts.get(part.partId);
    if (existingPart) existingPart.text += part.text;
    else
      message.parts.set(part.partId, {
        firstSequence: part.sequence,
        type: part.type,
        text: part.text,
      });
    messages.set(part.messageId, message);
  }

  return [...messages.values()]
    .sort((left, right) => left.firstSequence - right.firstSequence)
    .map((message) =>
      [...message.parts.values()]
        .sort((left, right) => left.firstSequence - right.firstSequence)
        .filter((part) => part.text.length > 0)
        .map((part) => ({ type: part.type, text: part.text })),
    )
    .filter((parts) => parts.length > 0)
    .map((message) => ({
      role: "assistant",
      parts: message,
    }));
}

export function projectRunCheckpoint(
  events: readonly AgentEvent[],
  transcript: AgentTranscriptMessage[],
) {
  let reasoning = "";
  const toolState: unknown[] = [];

  for (const event of events) {
    if (event.type === "reasoning.delta" && event.payload && typeof event.payload === "object") {
      const delta = (event.payload as { delta?: unknown }).delta;
      if (typeof delta === "string") reasoning += delta;
      continue;
    }
    if (event.type !== "message.delta")
      toolState.push({ type: event.type, payload: event.payload });
  }

  return {
    checkpointSequence: events.at(-1)?.sequence ?? 0,
    transcript,
    reasoning,
    toolState,
  };
}
