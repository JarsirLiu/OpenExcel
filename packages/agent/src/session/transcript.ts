import type { AgentTranscriptMessage } from "../runtime/contracts.js";

type RunLike = {
  inputText?: string | null;
  outputText?: string | null;
};

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
