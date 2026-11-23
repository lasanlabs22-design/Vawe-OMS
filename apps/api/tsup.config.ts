import { defineConfig } from "tsup";

// One file for production. The workspace packages are TypeScript source, so they're bundled in;
// the embedded dev database is never used in production and stays out.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  noExternal: ["@vawe/db", "@vawe/shared"],
  external: ["@electric-sql/pglite"],
});
