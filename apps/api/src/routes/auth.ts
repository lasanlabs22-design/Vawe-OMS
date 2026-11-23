import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb, userPhotos, users } from "@vawe/db";
import { accessMap, changePasswordSchema, loginSchema, profileSchema, type Me } from "@vawe/shared";
import { logActivity } from "../lib/activity";
import { clientIp, fail, idParam, readBody } from "../lib/http";
import { burnTime, hashPassword, verifyPassword } from "../lib/passwords";
import { parseJpegDataUrl, photoUrl } from "../lib/photos";
import { takeAttempt } from "../lib/rate-limit";
import { endAllSessions, endSession, startSession } from "../lib/sessions";
import { requireSession } from "../middleware/auth";
import type { AppEnv, AuthedUser, Scope } from "../types";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export function toMe(user: AuthedUser, scope: Scope): Me {
  const { photoAt, ...rest } = user;
  return { ...rest, photoUrl: photoUrl(scope, user.id, photoAt), access: accessMap(user) };
}

/**
 * Sign-in, sign-out, "who am I" and password change. Mounted twice: at /auth for the dashboard and at
 * /ops/auth for the console. Same accounts, separate sessions; the console only admits admins.
 */
export function authRoutes(scope: Scope) {
  const r = new Hono<AppEnv>();

  r.post("/login", async (c) => {
    const ip = clientIp(c);
    const wait = takeAttempt(ip);
    if (wait) fail(429, `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minutes.`);

    const { email, password } = await readBody(c, loginSchema);
    const wrong = () => fail(401, "Wrong email or password", { code: "BAD_CREDENTIALS" });
    const db = await getDb();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      await burnTime(password);
      await logActivity(db, { action: "auth.login_failed", meta: { email, scope, reason: "unknown_email" }, ip });
      return wrong();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      fail(429, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, { code: "LOCKED" });
    }

    if (!(await verifyPassword(password, user.passwordHash)) || !user.isActive) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await db
        .update(users)
        .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, user.id));
      await logActivity(db, {
        action: lock ? "auth.locked_out" : "auth.login_failed",
        targetUserId: user.id,
        meta: { scope, reason: user.isActive ? "wrong_password" : "inactive" },
        ip,
      });
      return wrong();
    }

    // Said only after a correct password, so it can't be used to discover which emails are admins.
    if (scope === "ops" && user.role !== "admin") {
      fail(403, "Only admins can use the ops console. Sign in at the dashboard instead.", { code: "NOT_ADMIN" });
    }

    await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await startSession(c, db, user.id, scope);
    await logActivity(db, { action: "auth.login", actorId: user.id, meta: { scope }, ip });

    return c.json({ ok: true, mustChangePassword: user.mustChangePassword });
  });

  r.post("/logout", async (c) => {
    const db = await getDb();
    await endSession(c, db, scope);
    return c.json({ ok: true });
  });

  r.get("/me", requireSession(scope, { allowPasswordChange: true }), (c) => c.json(toMe(c.get("user"), scope)));

  // ---------- Own profile (Settings → Profile) ----------

  r.patch("/profile", requireSession(scope), async (c) => {
    const me = c.get("user");
    const input = await readBody(c, profileSchema);
    const db = await getDb();
    await db
      .update(users)
      .set({
        name: input.name,
        department: input.department ?? null,
        bloodGroup: input.bloodGroup ?? null,
        phone: input.phone ?? null,
        emergencyName: input.emergencyName ?? null,
        emergencyRelation: input.emergencyRelation ?? null,
        emergencyPhone: input.emergencyPhone ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, me.id));
    await logActivity(db, { action: "profile.updated", actorId: me.id, targetUserId: me.id, ip: clientIp(c) });
    return c.json({ ok: true });
  });

  r.put("/profile/photo", requireSession(scope), async (c) => {
    const me = c.get("user");
    let dataUrl: unknown;
    try {
      dataUrl = ((await c.req.json()) as { dataUrl?: unknown }).dataUrl;
    } catch {
      /* handled below */
    }
    const jpeg = parseJpegDataUrl(dataUrl);
    if (!jpeg) fail(400, "Upload a JPEG picture under 150 KB");
    const db = await getDb();
    await db
      .insert(userPhotos)
      .values({ userId: me.id, jpeg })
      .onConflictDoUpdate({ target: userPhotos.userId, set: { jpeg, updatedAt: new Date() } });
    await logActivity(db, { action: "profile.photo_changed", actorId: me.id, targetUserId: me.id, ip: clientIp(c) });
    return c.json({ ok: true });
  });

  r.delete("/profile/photo", requireSession(scope), async (c) => {
    const me = c.get("user");
    const db = await getDb();
    await db.delete(userPhotos).where(eq(userPhotos.userId, me.id));
    await logActivity(db, { action: "profile.photo_changed", actorId: me.id, targetUserId: me.id, meta: { removed: true }, ip: clientIp(c) });
    return c.json({ ok: true });
  });

  // Anyone signed in may see colleagues' pictures (avatars in lists, assignees and so on).
  r.get("/photos/:id", requireSession(scope, { allowPasswordChange: true }), async (c) => {
    const id = idParam(c);
    const db = await getDb();
    const [photo] = await db.select().from(userPhotos).where(eq(userPhotos.userId, id)).limit(1);
    if (!photo) fail(404, "No picture");
    return c.body(Buffer.from(photo.jpeg, "base64"), 200, {
      "Content-Type": "image/jpeg",
      // URLs carry ?v=<updatedAt>, so a cached copy is never stale.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });

  // Own password. Signs out every other device; this one stays signed in.
  r.post("/password", requireSession(scope, { allowPasswordChange: true }), async (c) => {
    const me = c.get("user");
    const { current, next } = await readBody(c, changePasswordSchema);
    const db = await getDb();

    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id));
    if (!row || !(await verifyPassword(current, row.hash))) {
      fail(400, me.mustChangePassword ? "The temporary password is wrong" : "Current password is wrong", { field: "current" });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: sql`now()` })
      .where(eq(users.id, me.id));
    await endAllSessions(db, me.id, c.get("sessionHash"));
    await logActivity(db, { action: "auth.password_changed", actorId: me.id, targetUserId: me.id, ip: clientIp(c) });

    return c.json({ ok: true });
  });

  return r;
}
