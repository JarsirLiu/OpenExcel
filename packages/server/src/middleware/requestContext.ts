import type { FastifyReply, FastifyRequest } from "fastify";
import type { CurrentUserContext } from "../modules/auth/service.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUserContext | null;
  }
}

export function requireCurrentUser(
  req: FastifyRequest,
  reply: FastifyReply,
): CurrentUserContext | null {
  if (!req.currentUser) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }

  return req.currentUser;
}
