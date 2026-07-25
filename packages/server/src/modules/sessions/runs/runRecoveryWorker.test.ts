import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findStaleRunningRuns: vi.fn(),
  markStaleRunForRecovery: vi.fn(),
}));

vi.mock("./repository.js", () => mocks);

import { createRunRecoveryWorker } from "./runRecoveryWorker.js";

describe("run recovery worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks each stale running run for recovery", async () => {
    mocks.findStaleRunningRuns.mockResolvedValue([
      { id: 1, sessionId: 10, ownerId: "owner-1", sessionVersion: 3 },
      { id: 2, sessionId: 20, ownerId: "owner-2", sessionVersion: 4 },
    ]);
    mocks.markStaleRunForRecovery.mockResolvedValue({ count: 1 });

    const worker = createRunRecoveryWorker();

    await expect(worker.runOnce()).resolves.toBe(2);
    expect(mocks.markStaleRunForRecovery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 1 }),
    );
    expect(mocks.markStaleRunForRecovery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 2 }),
    );
  });

  it("delegates safely marked runs without owning recovery decisions", async () => {
    const run = {
      id: 3,
      sessionId: 30,
      ownerId: "owner-3",
      sessionVersion: 5,
      session: { workspaceId: 40 },
    };
    mocks.findStaleRunningRuns.mockResolvedValue([run]);
    mocks.markStaleRunForRecovery.mockResolvedValue({ count: 1 });
    const afterMarked = vi.fn().mockResolvedValue(undefined);

    await createRunRecoveryWorker({ afterMarked }).runOnce();

    expect(afterMarked).toHaveBeenCalledWith(run);
  });

  it("does not hide recovery callback failures", async () => {
    mocks.findStaleRunningRuns.mockResolvedValue([{ id: 4 }]);
    mocks.markStaleRunForRecovery.mockResolvedValue({ count: 1 });
    const error = new Error("recovery unavailable");

    await expect(
      createRunRecoveryWorker({
        afterMarked: async () => {
          throw error;
        },
      }).runOnce(),
    ).rejects.toBe(error);
  });

  it("coalesces overlapping scans", async () => {
    let resolveScan!: (runs: Array<{ id: number }>) => void;
    mocks.findStaleRunningRuns.mockReturnValue(
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
    );

    const worker = createRunRecoveryWorker();
    const first = worker.runOnce();
    const second = worker.runOnce();

    resolveScan([]);
    await expect(second).resolves.toBe(0);
    expect(mocks.findStaleRunningRuns).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(0);
  });
});
