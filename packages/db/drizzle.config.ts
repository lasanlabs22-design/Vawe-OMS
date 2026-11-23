import { defineConfig } from "drizzle-kit";

// Only `drizzle-kit generate` uses this: it diffs src/schema.ts against ./drizzle and writes a new
// SQL migration. Migrations are applied by src/migrate.ts (at API start-up and on deploy).
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/schema-business.ts"],
  out: "./drizzle",
});
