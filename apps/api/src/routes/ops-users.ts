import { Hono } from "hono";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { activityLog, getDb, userPermissions, userPhotos, users, type Db } from "@vawe/db";
import {
  createUserSchema,
  GRANTABLE_MODULES,
  updateUserSchema,
  type ActivityEntry,
  type GrantableModule,
  type IssuedCredentials,
  type Permissions,
  type TeamMember,
} from "@vawe/shared";
import { env } from "../env";
import { logActivity } from "../lib/activity";
import { clientIp, fail, idParam, readBody } from "../lib/http";
import { hashPassword, temporaryPassword } from "../lib/passwords";
import { photoUrl } from "../lib/photos";
import { endAllSessions } from "../lib/sessions";
import { requireSession } from "../middleware/auth";
import type { AppEnv } from "../types";

// People and access, for the ops console. Every route needs an admin's ops session. (Not use("*"):
// this router is mounted at /ops, next to /ops/auth, and must not guard the sign-in route.)
export const opsUsers = new Hono<AppEnv>();
for (const path of ["/users", "/users/*", "/activity"]) opsUsers.use(path, requireSession("ops"));

const signInUrl = `${env.appOrigin}/login`;

async function permissionsByUser(db: Db): Promise<Map<string, Permissions>> {
  const rows = await db.select().from(userPermissions);
  const map = new Map<string, Permissions>();
  for (const r of rows) {
    const p = map.get(r.userId) ?? {};
    p[r.module as GrantableModule] = r.level;
    map.set(r.userId, p);
  }
  return map;
}

async function replacePermissions(db: Db, userId: string, permissions: Permissions): Promise<void> {
  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  const rows = GRANTABLE_MODULES.filter((m) => permissions[m]).map((module) => ({
    userId,
    module,
    level: permissions[module]!,
  }));
  if (rows.length) await db.insert(userPermissions).values(rows);
}

// There must always be at least one active admin, or nobody could manage access any more.
async function isLastActiveAdmin(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, userId)));
  return (row?.n ?? 0) === 0;
}

async function findUser(db: Db, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) fail(404, "Person not found");
  return user;
}

opsUsers.get("/users", async (c) => {
  const db = await getDb();
  const creator = alias(users, "creator");
  const rows = await db
    .select({ user: users, createdByName: creator.name, photoAt: userPhotos.updatedAt })
    .from(users)
    .leftJoin(creator, eq(creator.id, users.createdBy))
    .leftJoin(userPhotos, eq(userPhotos.userId, users.id))
    .orderBy(desc(users.isActive), asc(users.role), asc(users.name));
  const perms = await permissionsByUser(db);

  const team: TeamMember[] = rows.map(({ user: u, createdByName, photoAt }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    department: u.department,
    photoUrl: photoUrl("ops", u.id, photoAt),
    role: u.role,
    permissions: u.role === "admin" ? {} : (perms.get(u.id) ?? {}),
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil.toISOString() : null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    createdByName,
  }));
  return c.json(team);
});

opsUsers.post("/users", async (c) => {
  const me = c.get("user");
  const input = await readBody(c, createUserSchema);
  const db = await getDb();

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (taken) fail(409, "That email already has an account", { field: "email" });

  const password = temporaryPassword();
  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        role: input.role,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        createdBy: me.id,
      })
      .returning();
    if (input.role === "staff") await replacePermissions(tx as unknown as Db, user!.id, input.permissions);
    return user!;
  });

  await logActivity(db, {
    action: "user.created",
    actorId: me.id,
    targetUserId: created.id,
    meta: { role: input.role, permissions: input.role === "staff" ? input.permissions : "all" },
    ip: clientIp(c),
  });

  const credentials: IssuedCredentials = { name: created.name, email: created.email, temporaryPassword: password, signInUrl };
  return c.json(credentials, 201);
});

opsUsers.patch("/users/:id", async (c) => {
  const me = c.get("user");
  const id = idParam(c);
  const input = await readBody(c, updateUserSchema);
  const db = await getDb();
  const target = await findUser(db, id);

  if (input.email && input.email !== target.email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (taken) fail(409, "That email already has an account", { field: "email" });
  }

  if (input.role && input.role !== target.role) {
    if (id === me.id) fail(400, "Ask another admin to change your own role");
    if (input.role === "staff" && target.isActive && (await isLastActiveAdmin(db, id))) {
      fail(400, "There must be at least one active admin");
    }
  }

  const role = input.role ?? target.role;
  const changes: Record<string, unknown> = {};
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.name !== undefined && input.name !== target.name) patch.name = changes.name = input.name;
    if (input.email !== undefined && input.email !== target.email) patch.email = changes.email = input.email;
    if (input.phone !== undefined && input.phone !== target.phone) patch.phone = changes.phone = input.phone;
    if (role !== target.role) patch.role = changes.role = role;
    if (Object.keys(patch).length) await t.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id));

    if (role === "admin") {
      // Admins can do everything; stored grants would only confuse a later demotion.
      await t.delete(userPermissions).where(eq(userPermissions.userId, id));
    } else if (input.permissions) {
      await replacePermissions(t, id, input.permissions);
      changes.permissions = input.permissions;
    }
  });

  if (Object.keys(changes).length) {
    await logActivity(db, { action: "user.updated", actorId: me.id, targetUserId: id, meta: changes, ip: clientIp(c) });
  }
  return c.json({ ok: true });
});

// A new temporary password for someone who forgot theirs. They're signed out everywhere and must
// replace it when they next sign in.
opsUsers.post("/users/:id/reset-password", async (c) => {
  const me = c.get("user");
  const id = idParam(c);
  if (id === me.id) fail(400, "Change your own password from the account menu");
  const db = await getDb();
  const target = await findUser(db, id);

  const password = temporaryPassword();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, id));
  await endAllSessions(db, id);
  await logActivity(db, { action: "user.password_reset", actorId: me.id, targetUserId: id, ip: clientIp(c) });

  const credentials: IssuedCredentials = { name: target.name, email: target.email, temporaryPassword: password, signInUrl };
  return c.json(credentials);
});

opsUsers.post("/users/:id/status", async (c) => {
  const me = c.get("user");
  const id = idParam(c);
  let active: unknown;
  try {
    active = ((await c.req.json()) as { active?: unknown }).active;
  } catch {
    /* handled below */
  }
  if (typeof active !== "boolean") fail(400, "Send { active: true | false }");
  if (id === me.id) fail(400, "You can't deactivate yourself");

  const db = await getDb();
  const target = await findUser(db, id);
  if (!active && target.role === "admin" && (await isLastActiveAdmin(db, id))) {
    fail(400, "There must be at least one active admin");
  }

  await db
    .update(users)
    .set({ isActive: active, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, id));
  if (!active) await endAllSessions(db, id);
  await logActivity(db, {
    action: active ? "user.reactivated" : "user.deactivated",
    actorId: me.id,
    targetUserId: id,
    ip: clientIp(c),
  });
  return c.json({ ok: true });
});

opsUsers.get("/activity", async (c) => {
  const db = await getDb();
  const actor = alias(users, "actor");
  const target = alias(users, "target");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
  const rows = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      actorName: actor.name,
      targetName: target.name,
      meta: activityLog.meta,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(actor, eq(actor.id, activityLog.actorId))
    .leftJoin(target, eq(target.id, activityLog.targetUserId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);

  const entries: ActivityEntry[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  return c.json(entries);
});
