import { sql } from "drizzle-orm";
import { counters, type Db } from "@vawe/db";

/** The next number in a named sequence, atomically (safe with two people saving at once). */
export async function nextNumber(db: Db, key: string): Promise<number> {
  const [row] = await db
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return row!.value;
}

/** VND-0001 */
export async function nextVendorCode(db: Db): Promise<string> {
  return `VND-${String(await nextNumber(db, "vendor")).padStart(4, "0")}`;
}

/** VW-2611-0001: year and month of the order date, then a number that restarts each month. */
export async function nextOrderCode(db: Db, orderDate: string): Promise<string> {
  const yymm = orderDate.slice(2, 4) + orderDate.slice(5, 7);
  return `VW-${yymm}-${String(await nextNumber(db, `order:${yymm}`)).padStart(4, "0")}`;
}
