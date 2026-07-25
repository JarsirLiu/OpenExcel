import type { RunEvent } from "@/api/chat";

type MessageLike = {
  id?: unknown;
  role?: unknown;
  parts?: unknown;
  __runLastSequence?: unknown;
};

type ProjectedPart = { type: "text" | "reasoning"; text: string; id?: string };

function eventPart(event: RunEvent): { messageId: string; partId: string; delta: string } | null {
  if (event.type !== "message.delta" && event.type !== "reasoning.delta") return null;
  if (!event.payload || typeof event.payload !== "object") return null;
  const payload = event.payload as { messageId?: unknown; partId?: unknown; delta?: unknown };
  if (typeof payload.messageId !== "string" || typeof payload.delta !== "string") {
    return null;
  }
  return {
    messageId: payload.messageId,
    partId:
      typeof payload.partId === "string" ? payload.partId : `${payload.messageId}-${event.type}`,
    delta: payload.delta,
  };
}

function findPart(parts: ProjectedPart[], partId: string, type: ProjectedPart["type"]) {
  return parts.findIndex((part) => part.id === partId || (part.type === type && !part.id));
}

function eventType(event: RunEvent): ProjectedPart["type"] {
  return event.type === "reasoning.delta" ? "reasoning" : "text";
}

function streamMessageId(runId: number, messageId: string) {
  return `run-${runId}-${messageId}`;
}

function cloneParts(parts: unknown): ProjectedPart[] {
  return Array.isArray(parts)
    ? (parts.map((part) => ({ ...(part as object) })) as ProjectedPart[])
    : [];
}

export function applyRunEventsToMessages(
  messages: readonly MessageLike[],
  runId: number,
  events: readonly RunEvent[],
): any[] {
  const next = messages.map((message) => ({ ...message }));
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    const streamed = eventPart(event);
    if (!streamed) continue;
    const id = streamMessageId(runId, streamed.messageId);
    let index = next.findIndex((message) => message.id === id);
    if (index < 0) {
      index = next.length;
      next.push({ id, role: "assistant", parts: [], __runLastSequence: -1 });
    }
    const message = next[index];
    const lastSequence =
      typeof message.__runLastSequence === "number" ? message.__runLastSequence : -1;
    if (event.sequence <= lastSequence) continue;
    const parts = cloneParts(message.parts);
    const type = eventType(event);
    const partIndex = findPart(parts, streamed.partId, type);
    if (partIndex < 0) {
      parts.push({ id: streamed.partId, type, text: streamed.delta });
    } else {
      parts[partIndex] = {
        ...parts[partIndex],
        id: streamed.partId,
        text: parts[partIndex].text + streamed.delta,
      };
    }
    next[index] = { ...message, parts, __runLastSequence: event.sequence };
  }
  return next;
}
