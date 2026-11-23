// Creates the first admin, or rescues an account, from a terminal. Everything else is done in ops.
//
//   pnpm admin --email you@vaweinterio.in --name "Your Name"     create an admin (prints a temporary password)
//   pnpm admin --email you@vaweinterio.in --reset                new temporary password, unlock, reactivate
//   pnpm admin --list                                            list accounts
//
// Uses DATABASE_URL from apps/api/.env (so it can be the live database), or the embedded dev database.
// Stop `pnpm dev` first when using the embedded database: only one process can open it.
import { parseArgs } from "node:util";
import { asc, eq } from "drizzle-orm";
import { closeDb, getDb, sessions, users } from "@vawe/db";
import { hashPassword, temporaryPassword } from "../src/lib/passwords";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    reset: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});

const db = await getDb();

try {
  if (values.list) {
    const rows = await db.select().from(users).orderBy(asc(users.role), asc(users.name));
    if (!rows.length) console.log("No accounts yet.");
    for (const u of rows) console.log(`${u.role.padEnd(5)}  ${u.isActive ? "active  " : "inactive"}  ${u.email}  (${u.name})`);
  } else {
    const email = values.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Pass --email");
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (values.reset) {
      if (!existing) throw new Error(`No account for ${email}`);
      await db
        .update(users)
        .set({ passwordHash, mustChangePassword: true, isActive: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      await db.delete(sessions).where(eq(sessions.userId, existing.id));
      console.log(`Reset ${email}.`);
    } else {
      if (existing) throw new Error(`${email} already has an account. Use --reset to give it a new password.`);
      const name = values.name?.trim();
      if (!name) throw new Error('Pass --name "Their Name"');
      await db.insert(users).values({ name, email, role: "admin", passwordHash, mustChangePassword: true });
      console.log(`Created admin ${name} <${email}>.`);
    }
    console.log(`Temporary password: ${password}`);
    console.log("They'll be asked to choose their own password at first sign-in.");
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
