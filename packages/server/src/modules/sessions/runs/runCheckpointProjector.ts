import type { AgentEvent, AgentTranscriptMessage } from "@openexcel/agent";

type StreamedPart = {
  messageId: string;
  sequence: number;
  text: string;
};

function streamedPart(event: AgentEvent): StreamedPart | null {
  if (event.type !== "message.delta") return null;
  if (!event.payload || typeof event.payload !== "object") return null;

  const payload = event.payload as {
    delta?: unknown;
    messageId?: unknown;
  };
  if (typeof payload.delta !== "string" || typeof payload.messageId !== "string") return null;

  return { messageId: payload.messageId, sequence: event.sequence, text: payload.delta };
}

export function projectStreamedAssistantMessages(
  events: readonly AgentEvent[],
): AgentTranscriptMessage[] {
  const messages = new Map<string, { firstSequence: number; text: string }>();

  for (const event of events) {
    const part = streamedPart(event);
    if (!part) continue;
    const existing = messages.get(part.messageId);
    if (existing) {
      existing.text += part.text;
    } else {
      messages.set(part.messageId, { firstSequence: part.sequence, text: part.text });
    }
  }

  return [...messages.values()]
    .sort((left, right) => left.firstSequence - right.firstSequence)
    .filter((message) => message.text.length > 0)
    .map((message) => ({
      role: "assistant",
      parts: [{ type: "text", text: message.text }],
    }));
}
