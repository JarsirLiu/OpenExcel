import type { ContextSummary } from "./compaction/types.js";

export const CONTEXT_SUMMARY_PREFIX =
  "The conversation history before this point was compacted into the following summary:\n\n<context-summary>\n";
export const CONTEXT_SUMMARY_SUFFIX = "\n</context-summary>";

export interface ModelContextAssemblerInput {
  baseSystemPrompt: string;
  summary?: ContextSummary;
  recentMessages: readonly unknown[];
  actualToolDefinitions: readonly unknown[];
}

export interface AssembledModelContext {
  system: string;
  messages: readonly unknown[];
  tools: readonly unknown[];
}

export function createContextSummaryMessage(summary: ContextSummary): Record<string, unknown> {
  return {
    id: "context-summary",
    role: "user",
    parts: [
      {
        type: "text",
        text: `${CONTEXT_SUMMARY_PREFIX}${JSON.stringify(summary, null, 2)}${CONTEXT_SUMMARY_SUFFIX}`,
      },
    ],
  };
}

export function assembleModelContext(input: ModelContextAssemblerInput): AssembledModelContext {
  return {
    system: input.baseSystemPrompt,
    messages: input.summary
      ? [createContextSummaryMessage(input.summary), ...input.recentMessages]
      : input.recentMessages,
    tools: input.actualToolDefinitions,
  };
}
