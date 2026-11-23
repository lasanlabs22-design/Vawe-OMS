import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { closeDb, getDb, MIGRATIONS_DIR, seedReferenceData } from "@vawe/db";
import { app } from "./app";
import { env } from "./env";

// The bundled API runs from apps/api/dist, so look for the migrations folder in the likely places.
function migrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    MIGRATIONS_DIR,
    path.resolve(process.cwd(), "packages/db/drizzle"),
    path.resolve(process.cwd(), "../../packages/db/drizzle"),
  ].filter(Boolean) as string[];
  const found = candidates.find((d) => fs.existsSync(path.join(d, "meta", "_journal.json")));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(", ")})`);
  return found;
}

const db = await getDb();
// The embedded dev database migrates itself in getDb(). Real Postgres is migrated here, before any
// request is served. There is one API instance, so nothing else migrates at the same time.
if (process.env.DATABASE_URL) {
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
// Make sure the catalogue, stock list and walk-in vendor exist (only fills an empty database).
await seedReferenceData(db);

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
