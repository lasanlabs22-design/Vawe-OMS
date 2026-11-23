import { serve } from "@hono/node-server";
import { closeDb, getDb } from "@vawe/db";
import { app } from "./app";
import { env } from "./env";

// Connect (and, for the embedded dev database, migrate) before accepting requests.
await getDb();

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
