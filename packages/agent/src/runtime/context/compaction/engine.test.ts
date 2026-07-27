import { describe, expect, it, vi } from "vitest";
import { ContextCompactionEngine } from "./engine.js";
import type { ContextCheckpoint, ContextCheckpointStore } from "./types.js";

const estimator = { estimate: (value: unknown) => JSON.stringify(value).length };
const summary = {
  goal: ["goal"],
  constraints: [],
  completed: ["old work"],
  inProgress: ["current work"],
  blocked: [],
  decisions: [],
  nextSteps: ["next"],
  criticalFacts: ["fact"],
  references: [],
};

function transcript(messages: readonly unknown[]) {
  return messages.map((message, cursor) => ({ cursor, message }));
}

function createStore(initial: ContextCheckpoint | null = null) {
  let current = initial;
  return {
    store: {
      load: vi.fn(async () => current),
      save: vi.fn(async ({ checkpoint, expectedVersion }) => {
        if ((current?.version ?? null) !== expectedVersion) {
          return { accepted: false, current: current ?? undefined };
        }
        current = checkpoint;
        return { accepted: true };
      }),
    } satisfies ContextCheckpointStore,
    getCurrent: () => current,
  };
}

function engine(
  store: ContextCheckpointStore,
  summaryGenerator = { generate: vi.fn(async () => summary) },
) {
  return new ContextCompactionEngine({
    checkpointStore: store,
    summaryGenerator,
    estimator,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    sourceTranscriptHash: (entries) => `hash:${entries.length}`,
    policy: {
      triggerRatio: 0.8,
      safetyMarginTokens: 10,
      outputReserveTokens: 100,
      summaryMaxTokens: 1_000,
      keepRecentTokens: 100,
      maxCompactionRetries: 1,
    },
  });
}

describe("ContextCompactionEngine", () => {
  it("summarizes old turns and persists the covered transcript cursor", async () => {
    const { store, getCurrent } = createStore();
    const result = await engine(store).compact({
      contextKey: "session-1",
      transcript: transcript([
        { role: "user", content: "old" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "recent" },
        { role: "assistant", content: "recent answer" },
      ]),
      contextWindowTokens: 10_000,
      modelContext: { systemPrompt: "system", toolDefinitions: [] },
      predictedInputTokens: 900,
      externalContextRevision: "workbook:3",
    });

    expect(result.compactedMessages).toHaveLength(2);
    expect(result.recentMessages).toHaveLength(2);
    expect(result.checkpoint.coveredTranscriptCursor).toBe(1);
    expect(result.checkpoint.externalContextRevision).toBe("workbook:3");
    expect(getCurrent()?.version).toBe(1);
  });

  it("summarizes only transcript entries after the previous checkpoint", async () => {
    const { store } = createStore();
    const calls: Array<{ previousSummary?: unknown; messages: readonly unknown[] }> = [];
    const summaryGenerator = {
      generate: vi.fn(
        async (input: { previousSummary?: unknown; messages: readonly unknown[] }) => {
          calls.push(input);
          return summary;
        },
      ),
    };
    const instance = engine(store, summaryGenerator);

    await instance.compact({
      contextKey: "session-1",
      transcript: transcript([
        { role: "user", content: "old" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "recent" },
        { role: "assistant", content: "recent answer" },
      ]),
      contextWindowTokens: 10_000,
      predictedInputTokens: 900,
      externalContextRevision: "workbook:3",
    });

    await instance.compact({
      contextKey: "session-1",
      transcript: transcript([
        { role: "user", content: "old" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "recent" },
        { role: "assistant", content: "recent answer" },
        { role: "user", content: "new" },
        { role: "assistant", content: "new answer" },
        { role: "user", content: "latest" },
        { role: "assistant", content: "latest answer" },
      ]),
      contextWindowTokens: 10_000,
      predictedInputTokens: 900,
      externalContextRevision: "workbook:3",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].previousSummary).toEqual(summary);
    expect(calls[1].messages).toEqual([
      { role: "user", content: "recent" },
      { role: "assistant", content: "recent answer" },
      { role: "user", content: "new" },
      { role: "assistant", content: "new answer" },
    ]);
  });

  it("replaces stale external-revision summary with one CAS save", async () => {
    const oldCheckpoint = {
      schemaVersion: 1,
      checkpointId: "session-1:1",
      contextKey: "session-1",
      version: 1,
      coveredTranscriptCursor: 1,
      summaryVersion: 1,
      summary,
      sourceTranscriptHash: "hash:2",
      externalContextRevision: "workbook:2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies ContextCheckpoint;
    const { store, getCurrent } = createStore(oldCheckpoint);

    await engine(store).compact({
      contextKey: "session-1",
      transcript: transcript([
        { role: "user", content: "old" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "recent" },
      ]),
      contextWindowTokens: 10_000,
      predictedInputTokens: 900,
      externalContextRevision: "workbook:3",
    });

    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1 }));
    expect(getCurrent()?.version).toBe(2);
  });

  it("fails on a compare-and-swap conflict instead of overwriting another checkpoint", async () => {
    const { store } = createStore();
    store.save.mockResolvedValue({ accepted: false, current: undefined });

    await expect(
      engine(store).compact({
        contextKey: "session-1",
        transcript: transcript([
          { role: "user", content: "old" },
          { role: "assistant", content: "old answer" },
          { role: "user", content: "recent" },
        ]),
        contextWindowTokens: 10_000,
        predictedInputTokens: 900,
      }),
    ).rejects.toMatchObject({ stage: "checkpoint" });
  });
});
