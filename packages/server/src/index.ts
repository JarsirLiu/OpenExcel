import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { workbookRoutes } from "./workbook/routes.js";
import { sheetRoutes } from "./sheet/routes.js";
import { chatRoutes } from "./chat/routes.js";
import { pinoStream, logRequest } from "./logger.js";

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
await app.register(chatRoutes);

const port = Number(process.env.PORT ?? 4000);
try {
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`Server running at http://127.0.0.1:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
