import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt, ne } from "drizzle-orm";
import { sessions, userPermissions, userPhotos, users, type Db } from "@vawe/db";
import type { GrantableModule, Permissions } from "@vawe/shared";
import { env } from "../env";
import type { AuthedUser, Scope } from "../types";
import { clientIp } from "./http";

// The dashboard and the ops console have separate cookies and separate sessions. Signing in to one
// never signs you in to the other, and ops sessions are much shorter.
const LIFETIME_MS: Record<Scope, number> = {
  app: 7 * 24 * 60 * 60_000, // 7 days
  ops: 8 * 60 * 60_000, // 8 hours
};

// In production the __Host- prefix makes the browser insist on Secure, Path=/ and no Domain, so the
// cookie can't be set or read by any other subdomain.
const prefix = env.isProduction ? "__Host-" : "";
const COOKIE: Record<Scope, string> = { app: `${prefix}vawe_session`, ops: `${prefix}vawe_ops` };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(c: Context, db: Db, userId: string, scope: Scope): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  await db.insert(sessions).values({
    tokenHash,
    userId,
    scope,
    expiresAt: new Date(Date.now() + LIFETIME_MS[scope]),
    ip: clientIp(c),
    userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
  });
  setCookie(c, COOKIE[scope], token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge: LIFETIME_MS[scope] / 1000,
  });
  return tokenHash;
}

export async function endSession(c: Context, db: Db, scope: Scope): Promise<void> {
  const token = getCookie(c, COOKIE[scope]);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  deleteCookie(c, COOKIE[scope], { path: "/", secure: env.isProduction });
}

/** Signs someone out everywhere, optionally keeping the session they're using right now. */
export async function endAllSessions(db: Db, userId: string, keepTokenHash?: string): Promise<void> {
  await db
    .delete(sessions)
    .where(keepTokenHash ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, keepTokenHash)) : eq(sessions.userId, userId));
}

export async function loadPermissions(db: Db, userId: string): Promise<Permissions> {
  const rows = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.module as GrantableModule, r.level]));
}

const TOUCH_AFTER_MS = 5 * 60_000;

/**
 * The person behind this request's cookie, or null. A session only counts while it hasn't expired,
 * belongs to this scope, and its account is still active (and, for ops, still an admin).
 */
export async function readSession(c: Context, db: Db, scope: Scope): Promise<{ user: AuthedUser; tokenHash: string } | null> {
  const token = getCookie(c, COOKIE[scope]);
  if (!token || token.length > 100) return null;
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({ session: sessions, user: users, photoAt: userPhotos.updatedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userPhotos, eq(userPhotos.userId, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.scope, scope), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  const { session, user } = row;
  if (!user.isActive || (scope === "ops" && user.role !== "admin")) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
  }

  return {
    tokenHash,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      department: user.department,
      bloodGroup: user.bloodGroup,
      emergencyName: user.emergencyName,
      emergencyRelation: user.emergencyRelation,
      emergencyPhone: user.emergencyPhone,
      photoAt: row.photoAt,
      role: user.role,
      permissions: user.role === "admin" ? {} : await loadPermissions(db, user.id),
      mustChangePassword: user.mustChangePassword,
    },
  };
}
