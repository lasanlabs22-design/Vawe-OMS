import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { opsUsers } from "./routes/ops-users";
import type { AppEnv } from "./types";

// The browser never calls this API directly: the web app forwards /api/* here (next.config.ts), so
// everything is same-origin and the API can stay on Railway's private network.
export const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "Request too large" }, 413) }));
// Requests that change data must come from our own pages (checks the Origin header).
app.use("*", csrf({ origin: [env.appOrigin, env.opsOrigin] }));

app.get("/health", (c) => c.json({ ok: true }));

// Dashboard (app.vaweinterio.in)
app.route("/auth", authRoutes("app"));

// Ops console (ops.vaweinterio.in), admins only
app.route("/ops/auth", authRoutes("ops"));
app.route("/ops", opsUsers);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});
