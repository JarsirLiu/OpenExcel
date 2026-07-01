import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { workbookRoutes } from "./workbook/routes.js";
import { sheetRoutes } from "./sheet/routes.js";
import { chatRoutes } from "./chat/routes.js";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
        ignore: "pid,hostname,reqId,req,res,responseTime",
        singleLine: true,
        messageFormat: (log: any, messageKey: string) => {
          const parts: string[] = [];
          if (log.req) parts.push(`[${log.req.method}] ${log.req.url}`);
          parts.push(log[messageKey]);
          if (log.res) parts.push(`→ ${log.res.statusCode}`);
          if (log.responseTime != null) parts.push(`(${log.responseTime.toFixed(0)}ms)`);
          return parts.join(" ");
        },
      },
    },
  },
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
