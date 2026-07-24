import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRunRecoveryState: vi.fn(),
  findRunForSession: vi.fn(),
  findActiveRun: vi.fn(),
  findRunToolExecutions: vi.fn(),
  completeRunAndUpdateUndoCheckpoint: vi.fn(),
  transitionRunStatus: vi.fn(),
}));

vi.mock("../runs/repository.js", () => ({
  findRunRecoveryState: mocks.findRunRecoveryState,
  findRunForSession: mocks.findRunForSession,
  findActiveRun: mocks.findActiveRun,
  findRunToolExecutions: mocks.findRunToolExecutions,
  transitionRunStatus: mocks.transitionRunStatus,
}));
vi.mock("../runs/undoCheckpoint.js", () => ({
  completeRunAndUpdateUndoCheckpoint: mocks.completeRunAndUpdateUndoCheckpoint,
}));

import { abandonRun, recoverRun } from "./recovery.js";

describe("run recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findRunToolExecutions.mockResolvedValue([]);
    mocks.findActiveRun.mockResolvedValue(null);
    mocks.completeRunAndUpdateUndoCheckpoint.mockResolvedValue(true);
  });

  it("recovers a run only after every tool execution is completed", async () => {
    mocks.findRunRecoveryState.mockResolvedValueOnce({
      id: 7,
      status: "recovery_required",
      outputText: "done",
      session: {
        version: 4,
        chatMessages: JSON.stringify([
          { role: "assistant", parts: [{ type: "text", text: "done" }] },
        ]),
      },
    });
    mocks.findRunToolExecutions.mockResolvedValue([{ toolCallId: "call-1", status: "completed" }]);
    mocks.findRunForSession.mockResolvedValue({ id: 7, status: "completed" });

    await expect(recoverRun(1, 2, 7)).resolves.toEqual({
      runId: 7,
      status: "completed",
      canAutoRecover: true,
    });
    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledWith(
      1,
      2,
      7,
      expect.objectContaining({ status: "completed" }),
      undefined,
      { sessionVersion: 4 },
    );
  });

  it("does not complete a run with an unfinished or failed tool", async () => {
    mocks.findRunRecoveryState.mockResolvedValue({
      id: 7,
      status: "recovery_required",
      outputText: "done",
      session: { version: 4, chatMessages: "[]" },
    });
    mocks.findRunToolExecutions.mockResolvedValue([{ toolCallId: "call-1", status: "running" }]);

    await expect(recoverRun(1, 2, 7)).resolves.toMatchObject({
      runId: 7,
      status: "recovery_required",
      canAutoRecover: false,
    });
    expect(mocks.completeRunAndUpdateUndoCheckpoint).not.toHaveBeenCalled();
  });

  it("does not auto-complete a run without a persisted final assistant message", async () => {
    mocks.findRunRecoveryState.mockResolvedValue({
      id: 7,
      status: "recovery_required",
      outputText: null,
      session: { version: 4, chatMessages: "[]" },
    });

    await expect(recoverRun(1, 2, 7)).resolves.toMatchObject({
      runId: 7,
      status: "recovery_required",
      canAutoRecover: false,
    });
    expect(mocks.completeRunAndUpdateUndoCheckpoint).not.toHaveBeenCalled();
  });

  it("returns the same successful result when recovery is requested again", async () => {
    mocks.findRunRecoveryState.mockResolvedValue({
      id: 7,
      status: "completed",
      outputText: "done",
      session: { version: 4, chatMessages: "[]" },
    });

    await expect(recoverRun(1, 2, 7)).resolves.toEqual({
      runId: 7,
      status: "completed",
      canAutoRecover: true,
    });
  });

  it("abandons only runs waiting for recovery", async () => {
    mocks.findRunForSession.mockResolvedValue({
      id: 7,
      status: "recovery_required",
      errorMessage: "event persistence failed",
    });
    mocks.transitionRunStatus.mockResolvedValue({ id: 7, status: "abandoned" });

    await expect(abandonRun(1, 2, 7)).resolves.toEqual({ runId: 7, status: "abandoned" });
    expect(mocks.transitionRunStatus).toHaveBeenCalledWith(
      7,
      "abandoned",
      expect.objectContaining({ errorMessage: "event persistence failed" }),
    );
  });

  it("leaves the run recoverable when its session version changed", async () => {
    mocks.findRunRecoveryState.mockResolvedValue({
      id: 7,
      status: "recovery_required",
      outputText: "done",
      session: {
        version: 4,
        chatMessages: JSON.stringify([
          { role: "assistant", parts: [{ type: "text", text: "done" }] },
        ]),
      },
    });
    mocks.findRunToolExecutions.mockResolvedValue([{ status: "completed" }]);
    mocks.completeRunAndUpdateUndoCheckpoint.mockResolvedValue(false);

    await expect(recoverRun(1, 2, 7)).resolves.toEqual({
      runId: 7,
      status: "recovery_required",
      canAutoRecover: false,
      recoveryConflict: true,
    });
    expect(mocks.findRunForSession).not.toHaveBeenCalled();
  });
});
