import type { FastifyReply, FastifyRequest } from "fastify";
import { logRequest } from "../infra/observability/logger.js";

export function startTimerHook(req: FastifyRequest, _reply: FastifyReply, done: () => void) {
  (req as any)._startTime = Date.now();
  done();
}

export function responseLoggerHook(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  logRequest(req, reply, (req as any)._startTime);
  done();
}