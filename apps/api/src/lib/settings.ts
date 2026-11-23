import { eq } from "drizzle-orm";
import { appSettings, type Db } from "@vawe/db";
import type { Company, Rates } from "@vawe/shared";

export const SETTING_DEFAULT_RATES = "default_rates";
export const SETTING_COMPANY = "company";

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return (row?.value as T | undefined) ?? fallback;
}

export async function putSetting(db: Db, key: string, value: unknown, userId: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}

/** The price list used for walk-ins and for any rate a vendor doesn't have. */
export const getDefaultRates = (db: Db) => getSetting<Rates>(db, SETTING_DEFAULT_RATES, {});

export const getCompany = (db: Db) =>
  getSetting<Company>(db, SETTING_COMPANY, { name: "Vawe Interio", gstin: null, address: null, phone: null, email: null });
