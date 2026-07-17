import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSessionUndoCheckpoint: vi.fn(),
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  findSessionUndoCheckpoint: mocks.findSessionUndoCheckpoint,
}));

import { getUndoAvailability } from "./undoAvailability.js";

describe("getUndoAvailability", () => {
  beforeEach(() => {
    mocks.findSessionUndoCheckpoint.mockReset();
  });

  it("reports an armed checkpoint", async () => {
    mocks.findSessionUndoCheckpoint.mockResolvedValueOnce({ id: 5, undoRunId: 17 });

    await expect(getUndoAvailability(3, 5)).resolves.toEqual({ canUndo: true });
  });

  it("reports no checkpoint when the session is missing or cleared", async () => {
    mocks.findSessionUndoCheckpoint.mockResolvedValueOnce(null);
    await expect(getUndoAvailability(3, 5)).resolves.toEqual({ canUndo: false });

    mocks.findSessionUndoCheckpoint.mockResolvedValueOnce({ id: 5, undoRunId: null });
    await expect(getUndoAvailability(3, 5)).resolves.toEqual({ canUndo: false });
  });
});
