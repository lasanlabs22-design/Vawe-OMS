import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { requireSession } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { financeRoutes } from "./routes/finance";
import { inventoryRoutes } from "./routes/inventory";
import { opsUsers } from "./routes/ops-users";
import { orderRoutes } from "./routes/orders";
import { overviewRoutes } from "./routes/overview";
import { salesRoutes } from "./routes/sales";
import { vendorRoutes } from "./routes/vendors";
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

// The dashboard's modules. Every route needs a dashboard session; each module then checks the
// person's access (view/edit) itself.
const v1 = new Hono<AppEnv>();
v1.use("*", requireSession("app"));
v1.route("/", overviewRoutes);
v1.route("/", catalogRoutes);
v1.route("/", vendorRoutes);
v1.route("/", orderRoutes);
v1.route("/", financeRoutes);
v1.route("/", inventoryRoutes);
v1.route("/", salesRoutes);
app.route("/v1", v1);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});
