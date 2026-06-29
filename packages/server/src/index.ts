import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { workbookRoutes } from "./routes/workbooks.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart);
await app.register(workbookRoutes);

const port = Number(process.env.PORT ?? 4000);
try {
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`Server running at http://127.0.0.1:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
