import { AuthError } from "../domain/authErrors.js";
import type {
  AuthCredentialsInput,
  AuthRequestMetadata,
  CurrentUserContext,
} from "../domain/authTypes.js";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  hashSessionToken,
} from "../infrastructure/authSessionCookie.js";
import { PASSWORD_MIN_LENGTH } from "../infrastructure/passwordHasher.js";

export interface ValidatedCredentials {
  email: string;
  password: string;
  displayName: string;
}

export function normalizeDisplayName(displayName: string | undefined, email: string): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;

  const localPart = email.split("@")[0]?.trim();
  if (localPart) return localPart;

  return "用户";
}

export function validateCredentialsInput(input: AuthCredentialsInput): ValidatedCredentials {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
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

export function toCurrentUser(user: {
  id: number;
  email: string;
  displayName: string;
}): CurrentUserContext {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

export function buildSessionData(metadata: AuthRequestMetadata) {
  const rawToken = createSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000);

  return {
    rawToken,
    session: {
      tokenHash,
      expiresAt,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    },
  };
}
