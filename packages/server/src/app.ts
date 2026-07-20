import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { pinoStream } from "./infra/observability/logger.js";
import { webDistRoot } from "./infra/runtimePaths.js";
import { localAssetStorage, MAX_UPLOAD_FILE_BYTES } from "./infra/storage/localFileStorage.js";
import { responseLoggerHook, startTimerHook } from "./middleware/requestLogger.js";
import { resolveUserHook } from "./middleware/resolveUser.js";
import { createAssetService } from "./modules/assets/application/assetService.js";
import { createAssetCleanupWorker } from "./modules/assets/application/cleanupAssets.js";
import { authRoutes } from "./modules/auth/api/routes.js";
import { chartRoutes } from "./modules/charts/api/routes.js";
import { sessionRoutes } from "./modules/sessions/api/routes.js";
import { sheetRoutes } from "./modules/sheets/api/routes.js";
import { workbookRoutes } from "./modules/workbooks/api/routes.js";
import { workspaceRoutes } from "./modules/workspaces/api/routes.js";

export async function createApp() {
  const app = Fastify({ logger: { stream: pinoStream, level: "info" } });
  const assets = createAssetService(localAssetStorage);
  const assetCleanup = createAssetCleanupWorker(localAssetStorage);
  app.decorateRequest("currentUser", null);

  app.addHook("onRequest", startTimerHook);
  app.addHook("onRequest", resolveUserHook);
  app.addHook("onResponse", responseLoggerHook);

  await app.register(cors, {
    origin: true,
    exposedHeaders: ["X-OpenExcel-Session-Id", "X-OpenExcel-Session-Name"],
  });
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_FILE_BYTES,
      files: 1,
      fields: 1,
      parts: 2,
    },
  });
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(workbookRoutes, { assets });
  await app.register(chartRoutes);
  app.addHook("onReady", async () => assetCleanup.start());
  app.addHook("onClose", async () => assetCleanup.stop());
  await app.register(sheetRoutes);
  await app.register(sessionRoutes);

  app.get("/api/health", async () => ({ status: "ok" }));

  // 生产环境：server 自 serve 前端静态文件
  await app.register(fastifyStatic, {
    root: webDistRoot,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler((req, reply) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    reply.sendFile("index.html");
  });

  return app;
}
