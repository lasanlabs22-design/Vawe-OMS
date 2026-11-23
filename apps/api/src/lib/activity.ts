import { activityLog, type Db } from "@vawe/db";

export type ActivityAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.locked_out"
  | "auth.logout"
  | "auth.password_changed"
  | "profile.updated"
  | "profile.photo_changed"
  | "user.created"
  | "user.updated"
  | "user.password_reset"
  | "user.deactivated"
  | "user.reactivated";

export async function logActivity(
  db: Db,
  entry: {
    action: ActivityAction;
    actorId?: string | null;
    targetUserId?: string | null;
    meta?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  await db.insert(activityLog).values({
    action: entry.action,
    actorId: entry.actorId ?? null,
    targetUserId: entry.targetUserId ?? null,
    meta: entry.meta ?? null,
    ip: entry.ip ?? null,
  });
}
