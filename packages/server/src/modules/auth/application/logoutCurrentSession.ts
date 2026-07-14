import * as authRepository from "../infrastructure/authRepository.js";
import { hashSessionToken } from "../infrastructure/authSessionCookie.js";

export async function logoutCurrentSession(token: string | null): Promise<void> {
  if (token) {
    await authRepository.revokeSessionByTokenHash(hashSessionToken(token));
  }
}

export async function logoutAllSessionsForUser(userId: number): Promise<void> {
  await authRepository.revokeAllSessionsByUser(userId);
}
