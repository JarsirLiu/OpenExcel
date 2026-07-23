import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRunForSession: vi.fn(),
  requestRunCancellation: vi.fn(),
  notifyRunCancellation: vi.fn(),
}));

vi.mock("../runs/repository.js", () => ({
  findRunForSession: mocks.findRunForSession,
  requestRunCancellation: mocks.requestRunCancellation,
}));
vi.mock("../runs/cancellation.js", () => ({
  notifyRunCancellation: mocks.notifyRunCancellation,
}));

import { cancelRun } from "./cancelRun.js";

describe("cancelRun", () => {
  beforeEach(() => {
    mocks.findRunForSession.mockReset();
    mocks.requestRunCancellation.mockReset();
    mocks.notifyRunCancellation.mockReset();
  });

  it("persists and broadcasts cancellation for a running run", async () => {
    mocks.findRunForSession
      .mockResolvedValueOnce({ id: 12, status: "running", cancelRequestedAt: null })
      .mockResolvedValueOnce({
        id: 12,
        status: "running",
        cancelRequestedAt: new Date("2026-07-23T00:00:00.000Z"),
      });

    await expect(cancelRun(3, 7, 12)).resolves.toEqual({
      runId: 12,
      status: "running",
      cancelRequested: true,
    });
    expect(mocks.requestRunCancellation).toHaveBeenCalledWith(12);
    expect(mocks.notifyRunCancellation).toHaveBeenCalledWith(12);
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
  });
});
