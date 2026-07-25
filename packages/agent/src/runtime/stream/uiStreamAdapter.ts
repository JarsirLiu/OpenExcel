import { type ToolSet, toUIMessageStream } from "ai";
import type { AgentTranscriptMessage } from "../contracts.js";

export function createUIStreamAdapter(options: {
  stream: ReadableStream<any>;
  tools: ToolSet;
  originalMessages: AgentTranscriptMessage[];
}) {
  return toUIMessageStream({
    stream: options.stream,
    tools: options.tools,
    // Reasoning is part of the durable assistant projection. Keep it in the
    // UI stream after the provider stream finishes; the client only renders
    // and toggles this part and must not reconstruct it itself.
    sendReasoning: true,
    originalMessages: options.originalMessages as any,
    onError: (error) => String(error instanceof Error ? error.message : error),
  });
}
