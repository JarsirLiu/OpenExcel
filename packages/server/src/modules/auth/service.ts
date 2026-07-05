import type { FastifyReply, FastifyRequest } from "fastify";
import * as authRepo from "./repository.js";
import { AUTH_SESSION_MAX_AGE_SECONDS, buildClearedSessionCookie, buildSessionCookie, createSessionToken, extractSessionTokenFromCookie, hashSessionToken } from "./session.js";
import { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from "./password.js";
import * as workspaceService from "../workspaces/service.js";

export interface CurrentUserContext {
  id: number;
  email: string;
  displayName: string;
}

export interface AuthCredentialsInput {
  email: string;
  password: string;
  displayName?: string;
}

export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string | undefined, email: string): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;

  const localPart = email.split("@")[0]?.trim();
  if (localPart) {
    return localPart;
  }

  return "用户";
}

function toCurrentUser(user: { id: number; email: string; displayName: string }): CurrentUserContext {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function getRequestMetadata(req: FastifyRequest) {
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  return {
    userAgent,
    ipAddress: typeof req.ip === "string" ? req.ip : null,
  };
}

async function issueSessionForUser(userId: number, req: FastifyRequest, reply: FastifyReply) {
  const rawToken = createSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000);
  const metadata = getRequestMetadata(req);

  await authRepo.createSession({
    userId,
    tokenHash,
    expiresAt,
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });

  reply.header("Set-Cookie", buildSessionCookie(rawToken));
}

export async function resolveCurrentUser(req: FastifyRequest): Promise<CurrentUserContext | null> {
  const token = extractSessionTokenFromCookie(req.headers.cookie);
  if (!token) return null;

  const session = await authRepo.findSessionByTokenHash(hashSessionToken(token));
  if (!session) return null;

  return toCurrentUser(session.user);
}

async function validateCredentialsInput(input: AuthCredentialsInput): Promise<{ email: string; password: string; displayName: string }> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new AuthError("请输入有效邮箱", "INVALID_EMAIL");
  }

  const password = input.password.trim();
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(`密码至少需要 ${PASSWORD_MIN_LENGTH} 位`, "WEAK_PASSWORD");
  }

  return {
    email,
    password,
    displayName: normalizeDisplayName(input.displayName, email),
  };
}

export async function registerWithPassword(input: AuthCredentialsInput, req: FastifyRequest, reply: FastifyReply) {
  const validated = await validateCredentialsInput(input);
  const existingUser = await authRepo.findUserByEmail(validated.email);
  if (existingUser) {
    throw new AuthError("该邮箱已注册", "EMAIL_EXISTS", 409);
  }

  const passwordHash = await hashPassword(validated.password);
  const user = await authRepo.createUser({
    email: validated.email,
    displayName: validated.displayName,
    passwordHash,
  });

  await workspaceService.ensureWorkspaceForUser(user.id);
  await issueSessionForUser(user.id, req, reply);
  return toCurrentUser(user);
}

export async function loginWithPassword(input: AuthCredentialsInput, req: FastifyRequest, reply: FastifyReply) {
  const validated = await validateCredentialsInput(input);
  const user = await authRepo.findUserByEmail(validated.email);
  if (!user) {
    throw new AuthError("邮箱或密码错误", "INVALID_CREDENTIALS", 401);
  }

  const passwordValid = await verifyPassword(validated.password, user.passwordHash);
  if (!passwordValid) {
    throw new AuthError("邮箱或密码错误", "INVALID_CREDENTIALS", 401);
  }

  await workspaceService.ensureWorkspaceForUser(user.id);
  await issueSessionForUser(user.id, req, reply);
  return toCurrentUser(user);
}

export async function logoutCurrentSession(req: FastifyRequest, reply: FastifyReply) {
  const token = extractSessionTokenFromCookie(req.headers.cookie);
  if (token) {
    await authRepo.revokeSessionByTokenHash(hashSessionToken(token));
  }

  reply.header("Set-Cookie", buildClearedSessionCookie());
}

export async function logoutAllSessionsForUser(userId: number, reply: FastifyReply) {
  await authRepo.revokeAllSessionsByUser(userId);
  reply.header("Set-Cookie", buildClearedSessionCookie());
}
