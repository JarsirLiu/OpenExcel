import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModelConfig } from "../../model.js";
import type { ContextCheckpoint, ContextCheckpointStore } from "../context/compaction/types.js";
import type { ContextTranscriptEntry } from "../context/transcript.js";
import type { AgentTranscriptMessage } from "../contracts.js";
import { runAgentLoop } from "./agentLoop.js";

const runRealModelAcceptance = process.env.OPENEXCEL_REAL_MODEL_ACCEPTANCE === "1";

describe.skipIf(!runRealModelAcceptance)("real model context compaction acceptance", () => {
  it("compacts a 32K context and continues with the generated summary", async () => {
    const modelConfig: ModelConfig = {
      baseUrl: requiredEnvironment("MODEL_BASE_URL"),
      apiKey: requiredEnvironment("MODEL_API_KEY"),
      modelName: requiredEnvironment("MODEL_NAME"),
    };
    const acceptanceFact = "OPENEXCEL_COMPACTION_FACT_7F3A";
    const transcript = createLargeTranscript(acceptanceFact);
    let checkpoint: ContextCheckpoint | null = null;
    const checkpointStore: ContextCheckpointStore = {
      load: async () => checkpoint,
      save: async ({ checkpoint: next, expectedVersion }) => {
        if ((checkpoint?.version ?? null) !== expectedVersion) {
          return { accepted: false, current: checkpoint ?? undefined };
        }
        checkpoint = next;
        return { accepted: true };
      },
    };
    const stepEvents: Array<{ usage?: { inputTokens: number; source: string } }> = [];
    let toolCalls = 0;

    const result = await runAgentLoop({
      modelConfig,
      transcript,
      systemPrompt:
        "You are running a context-compaction acceptance test. Follow the user's instructions exactly. When asked to call record_acceptance, call it before answering.",
      toolCatalog: "record_acceptance: a harmless acceptance-test marker tool",
      tools: [
        {
          name: "record_acceptance",
          description: "Record the acceptance test marker. This tool has no side effects.",
          inputSchema: z.object({ marker: z.string() }),
        },
      ],
      toolExecutor: {
        execute: async () => {
          toolCalls += 1;
          return { accepted: true, marker: "tool-call-completed" };
        },
      },
      compaction: {
        triggerRatio: 0.25,
        safetyMarginTokens: 256,
        outputReserveTokens: 2_000,
        summaryMaxTokens: 2_048,
        keepRecentTokens: 3_500,
        maxCompactionRetries: 1,
      },
      compactionContextKey: "real-acceptance:32k",
      compactionCheckpointStore: checkpointStore,
      contextWindowTokens: 32_768,
      outputReserveTokens: 2_000,
      maxConversationTurns: 20,
      maxUserInputTokens: 16_000,
      timeout: { totalMs: 180_000, toolMs: 30_000 },
      maxRetries: 1,
      prepareStep: async (step: unknown) => {
        const stepNumber =
          step && typeof step === "object" && "stepNumber" in step
            ? (step as { stepNumber?: unknown }).stepNumber
            : undefined;
        return stepNumber === 0
          ? { toolChoice: { type: "tool", toolName: "record_acceptance" } }
          : undefined;
      },
      onModelStepFinished: (event) => {
        stepEvents.push({
          usage: event.usage
            ? { inputTokens: event.usage.inputTokens, source: event.usage.source }
            : undefined,
        });
      },
    });

    const completion = await result.completion;
    const savedCheckpoint = checkpoint as ContextCheckpoint | null;
    const summaryText = savedCheckpoint ? JSON.stringify(savedCheckpoint.summary) : "";

    console.log(
      JSON.stringify({
        status: completion.status,
        toolCalls,
        stepCount: stepEvents.length,
        providerInputTokens: stepEvents
          .map((event) => event.usage?.inputTokens)
          .filter((value): value is number => value !== undefined),
        checkpointVersion: savedCheckpoint?.version ?? null,
        coveredTranscriptCursor: savedCheckpoint?.coveredTranscriptCursor ?? null,
        completionText: completion.text?.slice(0, 500) ?? null,
        error: describeError(completion.error),
      }),
    );

    expect(completion.status).toBe("completed");
    expect(toolCalls).toBe(1);
    expect(stepEvents.length).toBeGreaterThanOrEqual(2);
    expect(stepEvents.every((event) => event.usage?.source === "provider")).toBe(true);
    expect(savedCheckpoint?.version).toBe(1);
    expect(savedCheckpoint?.coveredTranscriptCursor).toBeGreaterThanOrEqual(0);
    expect(savedCheckpoint?.coveredTranscriptCursor).toBeLessThan(
      transcript.at(-1)?.cursor ?? Number.POSITIVE_INFINITY,
    );
    expect(summaryText).toContain(acceptanceFact);
    expect(completion.text).toContain("OPENEXCEL_COMPACTION_ACCEPTANCE_OK");
    expect(completion.messages).not.toContainEqual(
      expect.objectContaining({
        parts: [expect.objectContaining({ text: expect.stringContaining("<context-summary>") })],
      }),
    );
  }, 240_000);
});

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} for real model acceptance`);
  return value;
}

function describeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error ? String(error) : null;
  const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
  return {
    name: error.name,
    message: error.message,
    ...(cause !== undefined ? { cause: describeError(cause) } : {}),
  };
}

function createLargeTranscript(
  acceptanceFact: string,
): ContextTranscriptEntry<AgentTranscriptMessage>[] {
  const entries: ContextTranscriptEntry<AgentTranscriptMessage>[] = [];
  let cursor = 0;
  for (let turn = 0; turn < 8; turn += 1) {
    const fact = turn === 0 ? ` The oldest critical fact is exactly ${acceptanceFact}.` : "";
    const body = Array.from(
      { length: 58 },
      (_, index) =>
        `Historical workbook note ${turn + 1}.${index + 1}: preserve this detail while compacting the conversation.`,
    ).join(" ");
    entries.push({
      cursor: cursor++,
      message: {
        id: `acceptance-user-${cursor}`,
        role: "user",
        parts: [{ type: "text", text: `${fact} ${body}` }],
      },
    });
    entries.push({
      cursor: cursor++,
      message: {
        id: `acceptance-assistant-${cursor}`,
        role: "assistant",
        parts: [
          { type: "text", text: `Turn ${turn + 1} was recorded and should remain available.` },
        ],
      },
    });
  }
  entries.push({
    cursor: cursor++,
    message: {
      id: `acceptance-current-user-${cursor}`,
      role: "user",
      parts: [
        {
          type: "text",
          text: `Call record_acceptance with marker "compaction". Then respond with exactly the marker OPENEXCEL_COMPACTION_ACCEPTANCE_OK and include the oldest critical fact exactly. Do not guess the fact from this message; retrieve it from the earlier conversation.`,
        },
      ],
    },
  });
  return entries;
}
