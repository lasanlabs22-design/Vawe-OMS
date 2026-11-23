import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// With DATABASE_URL set (Railway, or a local Postgres) we use real Postgres through postgres.js.
// Without it, local development falls back to an embedded Postgres (PGlite) stored in <repo>/.data,
// and migrations are applied to it automatically. Production refuses to start without DATABASE_URL.

export type Db = PostgresJsDatabase<typeof schema>;

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../drizzle");
const PGLITE_DIR = path.resolve(here, "../../../.data/pglite");

// Railway's private network (*.railway.internal) and localhost don't use TLS; anything else must.
function sslFor(url: string): false | "require" {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".railway.internal") ? false : "require";
}

async function connect(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: 10, ssl: sslFor(url) });
    return { db: drizzle(client, { schema }), close: () => client.end() };
  }

  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  fs.mkdirSync(PGLITE_DIR, { recursive: true });
  const client = new PGlite(PGLITE_DIR);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  // PGlite's driver offers the same query builder; the cast only papers over its different type name.
  return { db: db as unknown as Db, close: () => client.close() };
}

let pending: ReturnType<typeof connect> | undefined;

function connection() {
  // Don't cache a failed attempt: the next caller should retry.
  pending ??= connect().catch((err) => {
    pending = undefined;
    throw err;
  });
  return pending;
}

export async function getDb(): Promise<Db> {
  return (await connection()).db;
}

export async function closeDb(): Promise<void> {
  if (!pending) return;
  const c = await pending;
  pending = undefined;
  await c.close();
}

export { schema };
export * from "./schema";
