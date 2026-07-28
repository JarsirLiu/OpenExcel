import type { AgentTranscriptMessage } from "../runtime/contracts.js";

type RunLike = {
  inputText?: string | null;
  outputText?: string | null;
};

/**
 * Older event projections could close a pending tool without retaining its
 * streamed input. Keep those transcripts model-valid during recovery.
 */
export function normalizeToolErrorInputs<T extends AgentTranscriptMessage>(
  messages: readonly T[],
): T[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) return message;

    let changed = false;
    const parts = message.parts.map((part) => {
      if (!part || typeof part !== "object") return part;
      const value = part as Record<string, unknown>;
      if (
        value.state !== "output-error" ||
        typeof value.type !== "string" ||
        !value.type.startsWith("tool-") ||
        Object.hasOwn(value, "input") ||
        Object.hasOwn(value, "rawInput")
      ) {
        return part;
      }
      changed = true;
      return { ...value, input: {} };
    });

    return changed ? ({ ...message, parts } as T) : message;
  });
}

function messageId(transcript: AgentTranscriptMessage[], index: number) {
  const latestUserMessage = [...transcript]
    .reverse()
    .find((message) => message.role === "user" && typeof message.id === "string");
  const turnId =
    typeof latestUserMessage?.id === "string" ? latestUserMessage.id : crypto.randomUUID();
  return `assistant-${turnId}-${index + 1}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function errorTextOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  const record = asRecord(value);
  if (typeof record.message === "string" && record.message.length > 0) return record.message;
  if (typeof value === "string" && value.length > 0) return value;
  try {
    return JSON.stringify(value) || "工具调用失败";
  } catch {
    return String(value);
  }
}

function isToolErrorOutput(value: unknown): value is { error: unknown } {
  const record = asRecord(value);
  return record.isError === true && Object.hasOwn(record, "error");
}

function toToolPart(part: Record<string, unknown>) {
  const toolName = typeof part.toolName === "string" ? part.toolName : "unknown";
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : `tool-${toolName}`;
  if (part.type === "tool-call") {
    return {
      type: `tool-${toolName}`,
      toolCallId,
      state: "input-available",
      input: part.input,
    };
  }

  if (part.type === "tool-result" || part.type === "tool-error") {
    const toolError = part.type === "tool-error";
    const modelError = isToolErrorOutput(part.output);
    return {
      type: `tool-${toolName}`,
      toolCallId,
      state: toolError || modelError ? "output-error" : "output-available",
      input: part.input ?? {},
      ...(toolError || modelError
        ? {
            errorText: errorTextOf(toolError ? part.error : asRecord(part.output).error),
          }
        : { output: part.output }),
    };
  }

  return null;
}

export function appendResponseMessages(
  transcript: AgentTranscriptMessage[],
  responseMessages: unknown,
): AgentTranscriptMessage[] {
  if (!Array.isArray(responseMessages)) return transcript;

  const generated: AgentTranscriptMessage[] = [];
  const toolParts = new Map<string, Record<string, unknown>>();
  let assistantIndex = 0;

  for (const rawMessage of responseMessages) {
    if (!rawMessage || typeof rawMessage !== "object") continue;
    const message = rawMessage as Record<string, unknown>;
    const content = Array.isArray(message.content) ? message.content : [];

    if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      for (const rawPart of content) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const part = rawPart as Record<string, unknown>;
        if (part.type === "text" && typeof part.text === "string") {
          parts.push({ type: "text", text: part.text });
          continue;
        }
        const toolPart = toToolPart(part);
        if (toolPart) {
          parts.push(toolPart);
          toolParts.set(String(toolPart.toolCallId), toolPart);
        }
      }
      if (parts.length > 0) {
        generated.push({
          id: typeof message.id === "string" ? message.id : messageId(transcript, assistantIndex++),
          role: "assistant",
          parts,
        });
      }
      continue;
    }

    if (message.role === "tool") {
      for (const rawPart of content) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const part = rawPart as Record<string, unknown>;
        const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : undefined;
        if (!toolCallId) continue;
        const existing = toolParts.get(toolCallId);
        if (existing) {
          existing.input = part.input ?? existing.input ?? {};
          if (part.type === "tool-error" || isToolErrorOutput(part.output)) {
            existing.state = "output-error";
            existing.errorText = errorTextOf(
              part.type === "tool-error" ? part.error : asRecord(part.output).error,
            );
            delete existing.output;
          } else {
            existing.state = "output-available";
            existing.output = part.output;
            delete existing.errorText;
          }
        }
      }
    }
  }

  return removeEmptyAssistantMessages([...transcript, ...generated]);
}

export function removeEmptyAssistantMessages(
  messages: AgentTranscriptMessage[],
): AgentTranscriptMessage[] {
  return messages.filter(
    (message) =>
      !(message.role === "assistant" && Array.isArray(message.parts) && message.parts.length === 0),
  );
}

export function historyFromRuns(runs: RunLike[]) {
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  for (const run of runs) {
    if (run.inputText) transcript.push({ role: "user", content: run.inputText });
    if (run.outputText) transcript.push({ role: "assistant", content: run.outputText });
  }
  return transcript;
}
