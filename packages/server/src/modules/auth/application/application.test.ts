import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSessionByTokenHash: vi.fn(),
  findUserByEmail: vi.fn(),
  createUserWithSession: vi.fn(),
  createSession: vi.fn(),
  revokeSessionByTokenHash: vi.fn(),
  revokeAllSessionsByUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
}));

vi.mock("../infrastructure/authRepository.js", () => ({
  findSessionByTokenHash: mocks.findSessionByTokenHash,
  findUserByEmail: mocks.findUserByEmail,
  createUserWithSession: mocks.createUserWithSession,
  createSession: mocks.createSession,
  revokeSessionByTokenHash: mocks.revokeSessionByTokenHash,
  revokeAllSessionsByUser: mocks.revokeAllSessionsByUser,
}));

vi.mock("../infrastructure/passwordHasher.js", () => ({
  PASSWORD_MIN_LENGTH: 6,
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("../infrastructure/authSessionCookie.js", () => ({
  AUTH_SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
  createSessionToken: mocks.createSessionToken,
  hashSessionToken: mocks.hashSessionToken,
}));

import {
  loginWithPassword,
  logoutAllSessionsForUser,
  logoutCurrentSession,
  registerWithPassword,
  resolveCurrentUser,
} from "./index.js";

describe("auth service", () => {
  beforeEach(() => {
    mocks.findSessionByTokenHash.mockReset();
    mocks.findUserByEmail.mockReset();
    mocks.createUserWithSession.mockReset();
    mocks.createSession.mockReset();
    mocks.revokeSessionByTokenHash.mockReset();
    mocks.revokeAllSessionsByUser.mockReset();
    mocks.hashPassword.mockReset();
    mocks.verifyPassword.mockReset();
    mocks.createSessionToken.mockReset();
    mocks.hashSessionToken.mockReset();
  });

  it("resolves the current user from a valid session cookie", async () => {
    mocks.hashSessionToken.mockReturnValue("session-hash");
    mocks.findSessionByTokenHash.mockResolvedValue({
      user: { id: 7, email: "alice@example.com", displayName: "Alice" },
    });

    const currentUser = await resolveCurrentUser("session-token");

    expect(currentUser).toEqual({ id: 7, email: "alice@example.com", displayName: "Alice" });
  });

  it("registers a user and sets an auth cookie without provisioning workspace data", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.hashPassword.mockReturnValue("hashed-password");
    mocks.createUserWithSession.mockResolvedValue({
      id: 12,
      email: "new@example.com",
      displayName: "New User",
    });
    mocks.createSessionToken.mockReturnValue("session-token");
    mocks.hashSessionToken.mockReturnValue("session-hash");
    const result = await registerWithPassword(
      { email: "new@example.com", password: "password123", displayName: "New User" },
      { userAgent: null, ipAddress: "127.0.0.1" },
    );

    expect(result).toEqual({
      rawToken: "session-token",
      user: { id: 12, email: "new@example.com", displayName: "New User" },
    });
    expect(mocks.createUserWithSession).toHaveBeenCalledWith({
      user: {
        email: "new@example.com",
        displayName: "New User",
        passwordHash: "hashed-password",
      },
      session: {
        tokenHash: "session-hash",
        expiresAt: expect.any(Date),
        userAgent: null,
        ipAddress: "127.0.0.1",
      },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("logs in an existing user when the password is valid", async () => {
    mocks.findUserByEmail.mockResolvedValue({
      id: 44,
      email: "bob@example.com",
      displayName: "Bob",
      passwordHash: "stored-hash",
    });
    mocks.verifyPassword.mockReturnValue(true);
    mocks.createSessionToken.mockReturnValue("login-token");
    mocks.hashSessionToken.mockReturnValue("login-hash");
    const result = await loginWithPassword(
      { email: "bob@example.com", password: "password123" },
      { userAgent: null, ipAddress: "127.0.0.1" },
    );

    expect(result).toEqual({
      rawToken: "login-token",
      user: { id: 44, email: "bob@example.com", displayName: "Bob" },
    });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("password123", "stored-hash");
    expect(mocks.createSession).toHaveBeenCalledWith({
      userId: 44,
      tokenHash: "login-hash",
      expiresAt: expect.any(Date),
      userAgent: null,
      ipAddress: "127.0.0.1",
    });
  });

  it("rejects invalid login credentials", async () => {
    mocks.findUserByEmail.mockResolvedValue({
      id: 44,
      email: "bob@example.com",
      displayName: "Bob",
      passwordHash: "stored-hash",
    });
    mocks.verifyPassword.mockReturnValue(false);

    await expect(
      loginWithPassword(
        { email: "bob@example.com", password: "wrong-password" },
        { userAgent: null, ipAddress: null },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("logs out the current session and clears the cookie", async () => {
    mocks.hashSessionToken.mockReturnValue("session-hash");

    await logoutCurrentSession("session-token");

    expect(mocks.revokeSessionByTokenHash).toHaveBeenCalledWith("session-hash");
  });

  it("logs out all sessions for a user", async () => {
    await logoutAllSessionsForUser(77);

    expect(mocks.revokeAllSessionsByUser).toHaveBeenCalledWith(77);
  });
});
