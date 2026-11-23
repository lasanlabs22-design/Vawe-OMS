import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "staff"]);
export const bloodGroup = pgEnum("blood_group", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
// What can be granted per person in ops. The first four apply to admins and staff alike; inventory
// (changing stock) and settings (catalogue & prices) can only be held by admins. Everyone views
// inventory regardless.
export const grantableModule = pgEnum("grantable_module", ["sales", "vendor", "order", "finance", "inventory", "settings"]);
export const accessLevel = pgEnum("access_level", ["view", "edit"]);
// app = app.vaweinterio.in (the dashboard), ops = ops.vaweinterio.in (people and access).
export const sessionScope = pgEnum("session_scope", ["app", "ops"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Everyone who signs in: Vawe's admins and staff. There is no public sign-up; admins add people in
// ops, and the very first admin comes from the terminal (pnpm admin).
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Always stored lower-case.
    email: text("email").notNull(),
    phone: text("phone"),
    // Profile details each person keeps up to date themselves (Settings → Profile).
    department: text("department"),
    bloodGroup: bloodGroup("blood_group"),
    emergencyName: text("emergency_name"),
    emergencyRelation: text("emergency_relation"),
    emergencyPhone: text("emergency_phone"),
    role: userRole("role").notNull().default("staff"),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Set whenever someone else chose the password (new account, admin reset).
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    // 5 wrong passwords lock the account for 15 minutes.
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdBy: uuid("created_by").references((): any => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

// What each person may do in each grantable area. No row = no access (inventory: view only).
export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: grantableModule("module").notNull(),
    level: accessLevel("level").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.module] })],
);

// Profile pictures: a 320 px square JPEG (cropped and compressed in the browser, ~20-40 KB). Kept out
// of the users table so the session lookup on every request never drags image data along.
export const userPhotos = pgTable("user_photos", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  jpeg: text("jpeg_base64").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Server-side sessions. The cookie holds a random token; only its SHA-256 is stored here, so a leaked
// database can't be used to sign in. Deleting a row signs that device out immediately.
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: sessionScope("scope").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// Who did what, for admins. Append-only.
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    // e.g. "user.created", "user.permissions_changed", "auth.login_failed"
    action: text("action").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
