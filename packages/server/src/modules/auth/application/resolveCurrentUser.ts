import type { CurrentUserContext } from "../domain/authTypes.js";
import * as authRepository from "../infrastructure/authRepository.js";
import { hashSessionToken } from "../infrastructure/authSessionCookie.js";
import { toCurrentUser } from "./authSupport.js";

export async function resolveCurrentUser(token: string | null): Promise<CurrentUserContext | null> {
  if (!token) return null;

  const session = await authRepository.findSessionByTokenHash(hashSessionToken(token));
  if (!session) return null;

  return toCurrentUser(session.user);
}
