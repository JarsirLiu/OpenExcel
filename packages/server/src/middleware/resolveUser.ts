import type { FastifyRequest } from "fastify";
import { resolveCurrentUser } from "../modules/auth/service.js";

export async function resolveUserHook(req: FastifyRequest) {
  req.currentUser = await resolveCurrentUser(req);
}