import type { FastifyRequest } from "fastify";
import { resolveCurrentUser } from "../modules/auth/application/resolveCurrentUser.js";
import { extractSessionTokenFromCookie } from "../modules/auth/infrastructure/authSessionCookie.js";

export async function resolveUserHook(req: FastifyRequest) {
  const token = extractSessionTokenFromCookie(req.headers.cookie);
  req.currentUser = await resolveCurrentUser(token);
}
