import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  userCreate: vi.fn(),
  authSessionCreate: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { createUserWithSession } from "./authRepository.js";

describe("auth repository", () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
    mocks.userCreate.mockReset();
    mocks.authSessionCreate.mockReset();
  });

  it("creates the user and auth session in one transaction", async () => {
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback({
        user: { create: mocks.userCreate },
        authSession: { create: mocks.authSessionCreate },
      }),
    );
    mocks.userCreate.mockResolvedValueOnce({ id: 12, email: "new@example.com" });

    const user = await createUserWithSession({
      user: {
        email: "new@example.com",
        displayName: "New User",
        passwordHash: "hashed-password",
      },
      session: {
        tokenHash: "session-hash",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        userAgent: "test-agent",
        ipAddress: "127.0.0.1",
      },
    });

    expect(user).toEqual({ id: 12, email: "new@example.com" });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        email: "new@example.com",
        displayName: "New User",
        passwordHash: "hashed-password",
      },
    });
    expect(mocks.authSessionCreate).toHaveBeenCalledWith({
      data: {
        userId: 12,
        tokenHash: "session-hash",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        userAgent: "test-agent",
        ipAddress: "127.0.0.1",
      },
    });
  });
});
