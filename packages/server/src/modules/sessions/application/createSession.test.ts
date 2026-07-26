import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  createSession: mocks.createSession,
}));

import { createSession } from "./createSession.js";

describe("createSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates only the formal session", async () => {
    const session = { id: 11, publicId: "session-11", name: "新对话" };
    mocks.createSession.mockResolvedValue(session);

    await expect(createSession(3)).resolves.toBe(session);
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.createSession).toHaveBeenCalledWith(3, "新对话");
  });
});
