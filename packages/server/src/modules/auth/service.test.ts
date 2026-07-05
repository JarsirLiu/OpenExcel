import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSessionByTokenHash: vi.fn(),
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createSession: vi.fn(),
  revokeSessionByTokenHash: vi.fn(),
  revokeAllSessionsByUser: vi.fn(),
  ensureWorkspaceForUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
  buildSessionCookie: vi.fn(),
  buildClearedSessionCookie: vi.fn(),
  extractSessionTokenFromCookie: vi.fn(),
}));

vi.mock("./repository.js", () => ({
  findSessionByTokenHash: mocks.findSessionByTokenHash,
  findUserByEmail: mocks.findUserByEmail,
  createUser: mocks.createUser,
  createSession: mocks.createSession,
  revokeSessionByTokenHash: mocks.revokeSessionByTokenHash,
  revokeAllSessionsByUser: mocks.revokeAllSessionsByUser,
}));

vi.mock("../workspaces/service.js", () => ({
  ensureWorkspaceForUser: mocks.ensureWorkspaceForUser,
}));

vi.mock("./password.js", () => ({
  PASSWORD_MIN_LENGTH: 6,
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("./session.js", () => ({
  AUTH_SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
  createSessionToken: mocks.createSessionToken,
  hashSessionToken: mocks.hashSessionToken,
  buildSessionCookie: mocks.buildSessionCookie,
  buildClearedSessionCookie: mocks.buildClearedSessionCookie,
  extractSessionTokenFromCookie: mocks.extractSessionTokenFromCookie,
}));

import {
  logoutAllSessionsForUser,
  logoutCurrentSession,
  loginWithPassword,
  registerWithPassword,
  resolveCurrentUser,
} from "./service.js";

describe("auth service", () => {
  beforeEach(() => {
    mocks.findSessionByTokenHash.mockReset();
    mocks.findUserByEmail.mockReset();
    mocks.createUser.mockReset();
    mocks.createSession.mockReset();
    mocks.revokeSessionByTokenHash.mockReset();
    mocks.revokeAllSessionsByUser.mockReset();
    mocks.ensureWorkspaceForUser.mockReset();
    mocks.hashPassword.mockReset();
    mocks.verifyPassword.mockReset();
    mocks.createSessionToken.mockReset();
    mocks.hashSessionToken.mockReset();
    mocks.buildSessionCookie.mockReset();
    mocks.buildClearedSessionCookie.mockReset();
    mocks.extractSessionTokenFromCookie.mockReset();
  });

  it("resolves the current user from a valid session cookie", async () => {
    mocks.extractSessionTokenFromCookie.mockReturnValue("session-token");
    mocks.hashSessionToken.mockReturnValue("session-hash");
    mocks.findSessionByTokenHash.mockResolvedValue({
      user: { id: 7, email: "alice@example.com", displayName: "Alice" },
    });

    const currentUser = await resolveCurrentUser({ headers: { cookie: "openexcel_session=session-token" } } as any);

    expect(currentUser).toEqual({ id: 7, email: "alice@example.com", displayName: "Alice" });
  });

  it("registers a user, provisions a workspace, and sets a cookie", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.createUser.mockResolvedValue({ id: 12, email: "new@example.com", displayName: "New User" });
    mocks.ensureWorkspaceForUser.mockResolvedValue({ id: 99 });
    mocks.createSessionToken.mockReturnValue("session-token");
    mocks.hashSessionToken.mockReturnValue("session-hash");
    mocks.buildSessionCookie.mockReturnValue("cookie-value");

    const reply = { header: vi.fn() };
    const user = await registerWithPassword(
      { email: "new@example.com", password: "password123", displayName: "New User" },
      { headers: {}, ip: "127.0.0.1" } as any,
      reply as any,
    );

    expect(user).toEqual({ id: 12, email: "new@example.com", displayName: "New User" });
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "new@example.com",
      displayName: "New User",
      passwordHash: "hashed-password",
    });
    expect(mocks.ensureWorkspaceForUser).toHaveBeenCalledWith(12);
    expect(mocks.createSession).toHaveBeenCalledWith({
      userId: 12,
      tokenHash: "session-hash",
      expiresAt: expect.any(Date),
      userAgent: null,
      ipAddress: "127.0.0.1",
    });
    expect(reply.header).toHaveBeenCalledWith("Set-Cookie", "cookie-value");
  });

  it("logs in an existing user when the password is valid", async () => {
    mocks.findUserByEmail.mockResolvedValue({
      id: 44,
      email: "bob@example.com",
      displayName: "Bob",
      passwordHash: "stored-hash",
    });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.ensureWorkspaceForUser.mockResolvedValue({ id: 101 });
    mocks.createSessionToken.mockReturnValue("login-token");
    mocks.hashSessionToken.mockReturnValue("login-hash");
    mocks.buildSessionCookie.mockReturnValue("login-cookie");

    const reply = { header: vi.fn() };
    const user = await loginWithPassword(
      { email: "bob@example.com", password: "password123" },
      { headers: {}, ip: "127.0.0.1" } as any,
      reply as any,
    );

    expect(user).toEqual({ id: 44, email: "bob@example.com", displayName: "Bob" });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("password123", "stored-hash");
    expect(mocks.ensureWorkspaceForUser).toHaveBeenCalledWith(44);
    expect(reply.header).toHaveBeenCalledWith("Set-Cookie", "login-cookie");
  });

  it("rejects invalid login credentials", async () => {
    mocks.findUserByEmail.mockResolvedValue({
      id: 44,
      email: "bob@example.com",
      displayName: "Bob",
      passwordHash: "stored-hash",
    });
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      loginWithPassword(
        { email: "bob@example.com", password: "wrong-password" },
        { headers: {} } as any,
        { header: vi.fn() } as any,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("logs out the current session and clears the cookie", async () => {
    mocks.extractSessionTokenFromCookie.mockReturnValue("session-token");
    mocks.hashSessionToken.mockReturnValue("session-hash");
    mocks.buildClearedSessionCookie.mockReturnValue("cleared-cookie");

    const reply = { header: vi.fn() };
    await logoutCurrentSession({ headers: { cookie: "openexcel_session=session-token" } } as any, reply as any);

    expect(mocks.revokeSessionByTokenHash).toHaveBeenCalledWith("session-hash");
    expect(reply.header).toHaveBeenCalledWith("Set-Cookie", "cleared-cookie");
  });

  it("logs out all sessions for a user", async () => {
    mocks.buildClearedSessionCookie.mockReturnValue("cleared-cookie");

    const reply = { header: vi.fn() };
    await logoutAllSessionsForUser(77, reply as any);

    expect(mocks.revokeAllSessionsByUser).toHaveBeenCalledWith(77);
    expect(reply.header).toHaveBeenCalledWith("Set-Cookie", "cleared-cookie");
  });
});
