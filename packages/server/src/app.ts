import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { workbookRoutes } from "./modules/workbooks/routes.js";
import { sheetRoutes } from "./modules/sheets/routes.js";
import { sessionRoutes } from "./modules/sessions/routes.js";
import { pinoStream, logRequest } from "./logger.js";

export async function createApp() {
  const app = Fastify({ logger: { stream: pinoStream, level: "info" } });

  app.addHook("onRequest", (req, _reply, done) => {
    (req as any)._startTime = Date.now();
    done();
  });

  app.addHook("onResponse", (req, reply, done) => {
    logRequest(req, reply, (req as any)._startTime);
    done();
  });

  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(workbookRoutes);
  await app.register(sheetRoutes);
  await app.register(sessionRoutes);

  return app;
}
