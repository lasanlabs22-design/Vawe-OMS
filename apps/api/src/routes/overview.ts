import { Hono } from "hono";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { getDb, inventoryVariants, orders, vendorFollowups } from "@vawe/db";
import { canView } from "@vawe/shared";
import { todayIST } from "../lib/dates";
import { daysOverdue, loadLedger, outstandingOf } from "../lib/ledger";
import type { AppEnv } from "../types";

// Headline numbers for the Overview page, only for modules this person can see.
export const overviewRoutes = new Hono<AppEnv>();

export interface OverviewData {
  orders?: { active: number; inProduction: number; onHold: number; lateDeliveries: number };
  sales?: { monthOrders: number; monthValue: number };
  finance?: { receivable: number; overdue: number };
  vendor?: { openFollowups: number };
  inventory: { lowStock: number };
}

overviewRoutes.get("/overview", async (c) => {
  const me = c.get("user");
  const db = await getDb();
  const today = todayIST();
  const data: OverviewData = { inventory: { lowStock: 0 } };

  if (canView(me, "order")) {
    const rows = await db.select({ stage: orders.stage, onHold: orders.onHold, expected: orders.expectedDelivery }).from(orders).where(sql`${orders.stage} not in ('delivered', 'cancelled')`);
    data.orders = {
      active: rows.length,
      inProduction: rows.filter((r) => ["cutting", "drilling", "hinge_holes", "glass_cutting", "assembly", "packaging"].includes(r.stage)).length,
      onHold: rows.filter((r) => r.onHold).length,
      lateDeliveries: rows.filter((r) => r.expected && r.expected < today && r.stage !== "dispatched").length,
    };
  }
  if (canView(me, "sales")) {
    const [m] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number), v: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discountAmount}), 0)`.mapWith(Number) })
      .from(orders)
      .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, `${today.slice(0, 7)}-01`)));
    data.sales = { monthOrders: m?.n ?? 0, monthValue: Math.round(m?.v ?? 0) };
  }
  if (canView(me, "finance")) {
    const ledger = await loadLedger(db);
    data.finance = {
      receivable: Math.round(ledger.reduce((s, o) => s + outstandingOf(o), 0)),
      overdue: Math.round(ledger.filter((o) => daysOverdue(o, today) > 0).reduce((s, o) => s + outstandingOf(o), 0)),
    };
  }
  if (canView(me, "vendor")) {
    const [f] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(vendorFollowups).where(eq(vendorFollowups.status, "open"));
    data.vendor = { openFollowups: f?.n ?? 0 };
  }
  const [low] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(inventoryVariants)
    .where(and(eq(inventoryVariants.isActive, true), sql`${inventoryVariants.reorderLevel} > 0`, sql`${inventoryVariants.stock} <= ${inventoryVariants.reorderLevel}`));
  data.inventory.lowStock = low?.n ?? 0;
  return c.json(data);
});
