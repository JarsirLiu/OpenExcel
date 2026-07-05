import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { authRoutes } from "./modules/auth/routes.js";
import { workspaceRoutes } from "./modules/workspaces/routes.js";
import { workbookRoutes } from "./modules/workbooks/routes.js";
import { sheetRoutes } from "./modules/sheets/routes.js";
import { sessionRoutes } from "./modules/sessions/routes.js";
import { pinoStream, logRequest } from "./infra/observability/logger.js";
import { resolveCurrentUser } from "./modules/auth/service.js";

export async function createApp() {
  const app = Fastify({ logger: { stream: pinoStream, level: "info" } });
  app.decorateRequest("currentUser", null);

  app.addHook("onRequest", (req, _reply, done) => {
    (req as any)._startTime = Date.now();
    done();
  });

  app.addHook("onRequest", async (req, reply) => {
    const currentUser = await resolveCurrentUser(req);
    req.currentUser = currentUser;
  });

  app.addHook("onResponse", (req, reply, done) => {
    logRequest(req, reply, (req as any)._startTime);
    done();
  });

  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(workbookRoutes);
  await app.register(sheetRoutes);
  await app.register(sessionRoutes);

  return app;
}
