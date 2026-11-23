import { Hono } from "hono";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { getDb, inventoryItems, inventoryVariants, orders, payments, vendorFollowups, vendors } from "@vawe/db";
import { canView, PRODUCTION_STAGES, PRE_PRODUCTION_STAGES, type OrderStage } from "@vawe/shared";
import { addDays, eachDay, monthBounds, shiftMonth, todayIST } from "../lib/dates";
import { daysOverdue, loadLedger, outstandingOf, vendorStats } from "../lib/ledger";
import type { AppEnv } from "../types";

// Everything the Overview draws, only for the modules this person can see. Shaped for pictures:
// series, shares and distributions rather than single totals.
export const overviewRoutes = new Hono<AppEnv>();

export interface OverviewData {
  orders?: {
    active: number;
    onHold: number;
    lateDeliveries: number;
    phases: { pre: number; production: number; dispatched: number };
    stages: { stage: OrderStage; count: number }[];
    /** Orders created per day, last 12 weeks (84 days, oldest first). */
    activity: { date: string; count: number }[];
  };
  sales?: {
    monthOrders: number;
    monthValue: number;
    lastMonthToDate: number;
    lastMonthTotal: number;
    daily: { date: string; value: number }[];
  };
  finance?: {
    receivable: number;
    overdue: number;
    collectedThisMonth: number;
    aging: { label: string; amount: number }[];
  };
  vendor?: {
    openFollowups: number;
    health: { good: number; watch: number; at_risk: number; new: number };
    /** One entry per vendor with orders, for the waffle. */
    tiles: { name: string; health: "good" | "watch" | "at_risk" | "new" }[];
  };
  inventory: {
    lines: { ok: number; low: number; out: number };
    lowest: { name: string; colour: string; stock: number; reorderLevel: number; unit: string }[];
  };
}

const valueSql = sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discountAmount}), 0)`.mapWith(Number);

overviewRoutes.get("/overview", async (c) => {
  const me = c.get("user");
  const db = await getDb();
  const today = todayIST();
  const data: OverviewData = { inventory: { lines: { ok: 0, low: 0, out: 0 }, lowest: [] } };

  if (canView(me, "order")) {
    const rows = await db.select({ stage: orders.stage, onHold: orders.onHold, expected: orders.expectedDelivery }).from(orders).where(sql`${orders.stage} not in ('delivered', 'cancelled')`);
    const from = addDays(today, -83);
    const perDay = await db
      .select({ date: orders.orderDate, n: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, from)))
      .groupBy(orders.orderDate);
    const dayMap = new Map(perDay.map((r) => [r.date, r.n]));
    const stageList = [...PRE_PRODUCTION_STAGES, ...PRODUCTION_STAGES, "dispatched"] as OrderStage[];
    data.orders = {
      active: rows.length,
      onHold: rows.filter((r) => r.onHold).length,
      lateDeliveries: rows.filter((r) => r.expected && r.expected < today && r.stage !== "dispatched").length,
      phases: {
        pre: rows.filter((r) => PRE_PRODUCTION_STAGES.includes(r.stage)).length,
        production: rows.filter((r) => PRODUCTION_STAGES.includes(r.stage)).length,
        dispatched: rows.filter((r) => r.stage === "dispatched").length,
      },
      stages: stageList.map((stage) => ({ stage, count: rows.filter((r) => r.stage === stage).length })),
      activity: eachDay(from, today).map((date) => ({ date, count: dayMap.get(date) ?? 0 })),
    };
  }

  if (canView(me, "sales")) {
    const month = today.slice(0, 7);
    const prev = monthBounds(shiftMonth(month, -1));
    const dayOfMonth = Number(today.slice(8, 10));
    const prevToDate = addDays(prev.from, Math.min(dayOfMonth, Number(prev.to.slice(8, 10))) - 1);
    const sum = async (fromD: string, toD: string) =>
      (await db.select({ v: valueSql }).from(orders).where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, fromD), sql`${orders.orderDate} <= ${toD}`)))[0]?.v ?? 0;
    const [m] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number), v: valueSql })
      .from(orders)
      .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, `${month}-01`)));
    const from = addDays(today, -29);
    const perDay = await db
      .select({ date: orders.orderDate, v: valueSql })
      .from(orders)
      .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, from)))
      .groupBy(orders.orderDate);
    const map = new Map(perDay.map((r) => [r.date, r.v]));
    data.sales = {
      monthOrders: m?.n ?? 0,
      monthValue: Math.round(m?.v ?? 0),
      lastMonthToDate: Math.round(await sum(prev.from, prevToDate)),
      lastMonthTotal: Math.round(await sum(prev.from, prev.to)),
      daily: eachDay(from, today).map((date) => ({ date, value: Math.round(map.get(date) ?? 0) })),
    };
  }

  // Vendors and finance both need the ledger; load it once.
  const needLedger = canView(me, "finance") || canView(me, "vendor");
  const ledger = needLedger ? await loadLedger(db) : [];

  if (canView(me, "finance")) {
    const buckets = [0, 0, 0, 0];
    for (const o of ledger) {
      const owing = outstandingOf(o);
      if (owing <= 0) continue;
      const d = daysOverdue(o, today);
      buckets[d === 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : 3]! += owing;
    }
    const [collected] = await db
      .select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
      .from(payments)
      .where(gte(payments.paidOn, `${today.slice(0, 7)}-01`));
    data.finance = {
      receivable: Math.round(buckets.reduce((s, b) => s + b, 0)),
      overdue: Math.round(buckets[1]! + buckets[2]! + buckets[3]!),
      collectedThisMonth: Math.round(collected?.v ?? 0),
      aging: ["Not due yet", "1–30 days late", "31–60 days late", "60+ days late"].map((label, i) => ({ label, amount: Math.round(buckets[i]!) })),
    };
  }

  if (canView(me, "vendor")) {
    const [f] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(vendorFollowups).where(eq(vendorFollowups.status, "open"));
    const list = await db.select({ id: vendors.id, name: vendors.firmName }).from(vendors).where(and(eq(vendors.isActive, true), eq(vendors.isWalkIn, false)));
    const byVendor = new Map<string, typeof ledger>();
    for (const o of ledger) byVendor.set(o.vendorId, [...(byVendor.get(o.vendorId) ?? []), o]);
    const tiles = list.map((v) => ({ name: v.name, health: vendorStats(byVendor.get(v.id) ?? [], today).health }));
    const order = { at_risk: 0, watch: 1, good: 2, new: 3 } as const;
    tiles.sort((a, b) => order[a.health] - order[b.health] || a.name.localeCompare(b.name));
    data.vendor = {
      openFollowups: f?.n ?? 0,
      health: {
        good: tiles.filter((t) => t.health === "good").length,
        watch: tiles.filter((t) => t.health === "watch").length,
        at_risk: tiles.filter((t) => t.health === "at_risk").length,
        new: tiles.filter((t) => t.health === "new").length,
      },
      tiles,
    };
  }

  const lines = await db
    .select({ name: inventoryItems.name, unit: inventoryItems.unit, colour: inventoryVariants.colour, stock: inventoryVariants.stock, reorderLevel: inventoryVariants.reorderLevel })
    .from(inventoryVariants)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryVariants.itemId))
    .where(and(eq(inventoryVariants.isActive, true), eq(inventoryItems.isActive, true)));
  const tracked = lines.filter((l) => l.reorderLevel > 0 || l.stock > 0);
  data.inventory = {
    lines: {
      out: tracked.filter((l) => l.stock <= 0).length,
      low: tracked.filter((l) => l.stock > 0 && l.reorderLevel > 0 && l.stock <= l.reorderLevel).length,
      ok: tracked.filter((l) => l.stock > 0 && !(l.reorderLevel > 0 && l.stock <= l.reorderLevel)).length,
    },
    // Closest to running out, relative to their reorder level.
    lowest: tracked
      .filter((l) => l.reorderLevel > 0)
      .sort((a, b) => a.stock / a.reorderLevel - b.stock / b.reorderLevel)
      .slice(0, 6)
      .map((l) => ({ name: l.name, colour: l.colour, stock: l.stock, reorderLevel: l.reorderLevel, unit: l.unit })),
  };

  return c.json(data);
});
