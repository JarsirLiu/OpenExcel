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
    originalMessages: options.originalMessages as any,
    onError: (error) => String(error instanceof Error ? error.message : error),
  });
}
