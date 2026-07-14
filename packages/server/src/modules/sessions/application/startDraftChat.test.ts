import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  findRunByClientRequestId: vi.fn(),
  streamChat: vi.fn(),
}));

vi.mock("../chat/index.js", () => ({ streamChat: mocks.streamChat }));
vi.mock("../infrastructure/sessionRepository.js", () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
}));
vi.mock("../runs/repository.js", () => ({
  findRunByClientRequestId: mocks.findRunByClientRequestId,
}));

import { startDraftChat } from "./startDraftChat.js";

describe("startDraftChat", () => {
  const session = {
    id: 7,
    publicId: "session-7",
    workspaceId: 3,
    name: "新对话",
    chatMessages: "[]",
  };

  beforeEach(() => {
    mocks.createSession.mockReset();
    mocks.deleteSession.mockReset();
    mocks.findRunByClientRequestId.mockReset();
    mocks.streamChat.mockReset();
    mocks.findRunByClientRequestId.mockResolvedValue(null);
  });

  it("creates the session and starts its first stream in one use case", async () => {
    const stream = new ReadableStream();
    mocks.createSession.mockResolvedValue(session);
    mocks.streamChat.mockResolvedValue(stream);

    const result = await startDraftChat(3, [{ role: "user", content: "你好" }]);

    expect(mocks.createSession).toHaveBeenCalledWith(
      3,
      "你好",
      JSON.stringify([{ role: "user", content: "你好" }]),
    );
    expect(mocks.streamChat).toHaveBeenCalledWith(
      3,
      7,
      [{ role: "user", content: "你好" }],
      undefined,
      { clientRequestId: undefined },
    );
    expect(result).toEqual({ session, stream });
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("removes the session when stream setup fails", async () => {
    const error = new Error("provider unavailable");
    mocks.createSession.mockResolvedValue(session);
    mocks.streamChat.mockRejectedValue(error);

    await expect(startDraftChat(3, [])).rejects.toBe(error);

    expect(mocks.deleteSession).toHaveBeenCalledWith(7, 3);
  });

  it("rejects a duplicate first-message request before creating another session", async () => {
    mocks.findRunByClientRequestId.mockResolvedValue({ sessionId: 11 });

    await expect(
      startDraftChat(3, [{ role: "user", content: "你好" }], {
        clientRequestId: "request-1",
      }),
    ).rejects.toMatchObject({
      code: "DRAFT_REQUEST_ALREADY_PROCESSED",
      sessionId: 11,
    });

    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });
});
