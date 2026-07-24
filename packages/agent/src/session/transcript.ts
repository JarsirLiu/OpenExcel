import type { AgentTranscriptMessage } from "../runtime/contracts.js";

type RunLike = {
  inputText?: string | null;
  outputText?: string | null;
};

function messageId(transcript: AgentTranscriptMessage[], index: number) {
  const latestUserMessage = [...transcript]
    .reverse()
    .find((message) => message.role === "user" && typeof message.id === "string");
  const turnId =
    typeof latestUserMessage?.id === "string" ? latestUserMessage.id : crypto.randomUUID();
  return `assistant-${turnId}-${index + 1}`;
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
    return {
      type: `tool-${toolName}`,
      toolCallId,
      state: part.type === "tool-error" ? "output-error" : "output-available",
      input: part.input,
      ...(part.type === "tool-error" ? { errorText: String(part.error) } : { output: part.output }),
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
          id: messageId(transcript, assistantIndex++),
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
          existing.state = "output-available";
          existing.output = part.output;
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
