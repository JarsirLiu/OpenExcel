import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireCurrentUser } from "../../middleware/requestContext.js";
import * as service from "./service.js";
import { PASSWORD_MIN_LENGTH } from "./password.js";

const credentialsSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱"),
  password: z.string().min(PASSWORD_MIN_LENGTH, `密码至少需要 ${PASSWORD_MIN_LENGTH} 位`),
  displayName: z.string().trim().min(1).optional(),
});

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof service.AuthError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  throw error;
}

function parseCredentials(body: unknown) {
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "请求参数不正确",
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    return { user: currentUser };
  });

  app.post("/api/auth/register", async (req, reply) => {
    const parsed = parseCredentials(req.body);
    if (!parsed.ok) {
      return reply.status(400).send({ error: parsed.error });
    }

    try {
      const user = await service.registerWithPassword(parsed.data, req, reply);
      return reply.status(201).send({ user });
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = parseCredentials(req.body);
    if (!parsed.ok) {
      return reply.status(400).send({ error: parsed.error });
    }

    try {
      const user = await service.loginWithPassword(parsed.data, req, reply);
      return { user };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await service.logoutCurrentSession(req, reply);
    return reply.status(204).send();
  });

  app.post("/api/auth/logout-all", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    await service.logoutAllSessionsForUser(currentUser.id, reply);
    return reply.status(204).send();
  });
}
