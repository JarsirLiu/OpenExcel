import { createApp } from "./app.js";

const app = await createApp();
const port = Number(process.env.PORT ?? 4000);
try {
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`Server running at http://127.0.0.1:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
