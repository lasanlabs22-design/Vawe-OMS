// Applies pending migrations to DATABASE_URL. Railway runs this before each API deploy
// (`pnpm db:migrate`). Locally, without DATABASE_URL, getDb() migrates the embedded database itself.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb, MIGRATIONS_DIR } from "./index";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set: the embedded dev database migrates itself when the API starts.");
  await getDb();
  await closeDb();
  process.exit(0);
}

const db = await getDb();
await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
await closeDb();
console.log("Migrations applied.");
