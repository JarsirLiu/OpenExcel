import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSessionMessagesWithLease: vi.fn(),
  updateRunWithLease: vi.fn(),
  completeRunAndUpdateUndoCheckpoint: vi.fn(),
  withSessionLock: vi.fn(),
}));

vi.mock("../infrastructure/sessionLock.js", () => ({
  withSessionLock: mocks.withSessionLock,
}));
vi.mock("../infrastructure/sessionRepository.js", () => ({
  updateSessionMessagesWithLease: mocks.updateSessionMessagesWithLease,
}));
vi.mock("./repository.js", () => ({
  updateRunWithLease: mocks.updateRunWithLease,
}));
vi.mock("./undoCheckpoint.js", () => ({
  completeRunAndUpdateUndoCheckpoint: mocks.completeRunAndUpdateUndoCheckpoint,
}));

import { createRunFinalizer } from "./runFinalizer.js";

function createLease(release = vi.fn()) {
  return {
    run: { id: 9 },
    ownerId: "owner-1",
    sessionVersion: 3,
    release,
  } as any;
}

describe("createRunFinalizer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withSessionLock.mockImplementation(async (_sessionId, callback) => callback());
    mocks.updateSessionMessagesWithLease.mockResolvedValue(true);
    mocks.updateRunWithLease.mockResolvedValue(true);
    mocks.completeRunAndUpdateUndoCheckpoint.mockResolvedValue(undefined);
  });

  it("persists the canonical transcript before the terminal run state", async () => {
    const order: string[] = [];
    mocks.updateSessionMessagesWithLease.mockImplementation(async () => {
      order.push("transcript");
      return true;
    });
    mocks.completeRunAndUpdateUndoCheckpoint.mockImplementation(async () => {
      order.push("run");
    });
    const release = vi.fn(async () => order.push("lease"));
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });

    await finalizer.finalize({
      status: "completed",
      outputText: "done",
      messages: [{ role: "assistant", parts: [{ type: "text", text: "done" }] }],
    });

    expect(order).toEqual(["transcript", "run", "lease"]);
    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledWith(
      1,
      2,
      9,
      expect.objectContaining({ status: "completed", outputText: "done" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
  });

  it("uses recovery_required when transcript persistence fails and always releases the lease", async () => {
    mocks.updateSessionMessagesWithLease.mockRejectedValue(new Error("database unavailable"));
    const release = vi.fn().mockResolvedValue(undefined);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });

    await finalizer.finalize({ status: "completed", messages: [] });

    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledWith(
      1,
      2,
      9,
      expect.objectContaining({ status: "recovery_required" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("shares one finalization promise across duplicate triggers", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });
    const first = finalizer.finalize({ status: "completed", messages: [] });
    const second = finalizer.finalize({ status: "failed", messages: [] });

    await Promise.all([first, second]);

    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("marks a still-running run for recovery when terminal persistence fails", async () => {
    mocks.completeRunAndUpdateUndoCheckpoint.mockRejectedValue(new Error("database unavailable"));
    const release = vi.fn().mockResolvedValue(undefined);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });

    await finalizer.finalize({ status: "completed", messages: [] });

    expect(mocks.updateRunWithLease).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "recovery_required" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
