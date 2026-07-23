import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@/api/chat";

const mocks = vi.hoisted(() => ({
  fetchMessages: vi.fn(),
  fetchRunEvents: vi.fn(),
  fetchRuns: vi.fn(),
}));

vi.mock("@/api/chat", () => ({
  fetchMessages: mocks.fetchMessages,
  fetchRunEvents: mocks.fetchRunEvents,
  fetchRuns: mocks.fetchRuns,
}));

import {
  advanceRunCursor,
  RunRecoveryTimeoutError,
  readRunId,
  recoverRunOnce,
  recoverRunUntilTerminal,
} from "./runRecovery";

describe("run recovery", () => {
  beforeEach(() => {
    mocks.fetchMessages.mockReset();
    mocks.fetchRunEvents.mockReset();
    mocks.fetchRuns.mockReset();
  });

  it("reads the run id from the server response header", () => {
    expect(readRunId(new Response(null, { headers: { "X-OpenExcel-Run-Id": "17" } }))).toBe(17);
    expect(readRunId(new Response(null, { headers: { "X-OpenExcel-Run-Id": "invalid" } }))).toBe(
      null,
    );
  });

  it("advances the cursor only to the newest event", () => {
    const events = [
      { eventId: "event-2", sequence: 2 },
      { eventId: "event-3", sequence: 3 },
    ] as RunEvent[];

    expect(advanceRunCursor({ runId: 7, after: 1 }, events)).toEqual({ runId: 7, after: 3 });
    expect(advanceRunCursor({ runId: 7, after: 3 }, [])).toEqual({ runId: 7, after: 3 });
  });

  it("reads canonical messages only after the run reaches a terminal state", async () => {
    const page = {
      run: { runId: 7, status: "completed", terminal: true },
      events: [{ eventId: "event-2", sequence: 2 }],
      cursor: { after: 2, lastEventSequence: 2 },
      hasMore: false,
    };
    mocks.fetchRunEvents.mockResolvedValue(page);
    mocks.fetchMessages.mockResolvedValue({ messages: [{ id: "assistant-1" }], total: 1 });

    await expect(recoverRunOnce(9, 3, { runId: 7, after: 1 })).resolves.toMatchObject({
      snapshot: page.run,
      events: page.events,
      messages: [{ id: "assistant-1" }],
      cursor: { runId: 7, after: 2 },
    });
    expect(mocks.fetchRunEvents).toHaveBeenCalledWith(9, 3, 7, 1, 200, undefined);
    expect(mocks.fetchMessages).toHaveBeenCalledWith(9, 3, 200, 0, undefined);
  });

  it("does not report recovery as settled when the run stays active", async () => {
    mocks.fetchRunEvents.mockResolvedValue({
      run: { runId: 7, status: "running", terminal: false },
      events: [],
      cursor: { after: 1, lastEventSequence: 1 },
      hasMore: false,
    });

    await expect(
      recoverRunUntilTerminal(9, 3, { runId: 7, after: 1 }, { attempts: 2, delayMs: 0 }),
    ).rejects.toBeInstanceOf(RunRecoveryTimeoutError);
    expect(mocks.fetchRunEvents).toHaveBeenCalledTimes(2);
  });
});
