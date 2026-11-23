import { createMiddleware } from "hono/factory";
import { getDb } from "@vawe/db";
import { canEdit, canView, type Module } from "@vawe/shared";
import { fail } from "../lib/http";
import { readSession } from "../lib/sessions";
import type { AppEnv, Scope } from "../types";

/**
 * Every protected route goes through this. Someone still on a temporary password can only reach the
 * routes that let them replace it (allowPasswordChange).
 */
export const requireSession = (scope: Scope, { allowPasswordChange = false } = {}) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const db = await getDb();
    const found = await readSession(c, db, scope);
    if (!found) fail(401, "Please sign in again", { code: "UNAUTHENTICATED" });
    if (found.user.mustChangePassword && !allowPasswordChange) {
      fail(403, "Set a new password to continue", { code: "PASSWORD_CHANGE_REQUIRED" });
    }
    c.set("user", found.user);
    c.set("sessionHash", found.tokenHash);
    await next();
  });

/** For dashboard routes: the module's access level, checked on the server for every request. */
export const requireAccess = (module: Module, level: "view" | "edit") =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    const allowed = level === "edit" ? canEdit(user, module) : canView(user, module);
    if (!allowed) fail(403, "You don't have access to this", { code: "FORBIDDEN" });
    await next();
  });
