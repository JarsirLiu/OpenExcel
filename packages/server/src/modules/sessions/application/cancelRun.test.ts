import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRunForSession: vi.fn(),
  waitForRunSettlement: vi.fn(),
  requestRunCancellation: vi.fn(),
  notifyRunCancellation: vi.fn(),
}));

vi.mock("../runs/repository.js", () => ({
  findRunForSession: mocks.findRunForSession,
  waitForRunSettlement: mocks.waitForRunSettlement,
  requestRunCancellation: mocks.requestRunCancellation,
}));
vi.mock("../runs/cancellation.js", () => ({
  notifyRunCancellation: mocks.notifyRunCancellation,
}));

import { cancelRun } from "./cancelRun.js";

describe("cancelRun", () => {
  beforeEach(() => {
    mocks.findRunForSession.mockReset();
    mocks.waitForRunSettlement.mockReset();
    mocks.requestRunCancellation.mockReset();
    mocks.notifyRunCancellation.mockReset();
  });

  it("persists and broadcasts cancellation for a running run", async () => {
    mocks.findRunForSession.mockResolvedValueOnce({
      id: 12,
      status: "running",
      cancelRequestedAt: null,
    });
    mocks.waitForRunSettlement.mockResolvedValueOnce({
      id: 12,
      status: "cancelled",
      cancelRequestedAt: new Date("2026-07-23T00:00:00.000Z"),
    });

    await expect(cancelRun(3, 7, 12)).resolves.toEqual({
      runId: 12,
      status: "cancelled",
      cancelRequested: true,
    });
    expect(mocks.requestRunCancellation).toHaveBeenCalledWith(12);
    expect(mocks.notifyRunCancellation).toHaveBeenCalledWith(12);
    expect(mocks.waitForRunSettlement).toHaveBeenCalledWith(3, 7, 12);
  });

  it("is idempotent for a completed run", async () => {
    mocks.findRunForSession.mockResolvedValue({
      id: 12,
      status: "completed",
      cancelRequestedAt: null,
    });

    await expect(cancelRun(3, 7, 12)).resolves.toEqual({
      runId: 12,
      status: "completed",
      cancelRequested: false,
    });
    expect(mocks.requestRunCancellation).not.toHaveBeenCalled();
    expect(mocks.notifyRunCancellation).not.toHaveBeenCalled();
    expect(mocks.waitForRunSettlement).not.toHaveBeenCalled();
  });
});
