import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { authRoutes } from "./modules/auth/routes.js";
import { workspaceRoutes } from "./modules/workspaces/routes.js";
import { workbookRoutes } from "./modules/workbooks/routes.js";
import { sheetRoutes } from "./modules/sheets/routes.js";
import { sessionRoutes } from "./modules/sessions/routes.js";
import { pinoStream } from "./infra/observability/logger.js";
import { resolveUserHook } from "./middleware/resolveUser.js";
import { startTimerHook, responseLoggerHook } from "./middleware/requestLogger.js";

export async function createApp() {
  const app = Fastify({ logger: { stream: pinoStream, level: "info" } });
  app.decorateRequest("currentUser", null);

  app.addHook("onRequest", startTimerHook);
  app.addHook("onRequest", resolveUserHook);
  app.addHook("onResponse", responseLoggerHook);

  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(workbookRoutes);
  await app.register(sheetRoutes);
  await app.register(sessionRoutes);

  return app;
}
