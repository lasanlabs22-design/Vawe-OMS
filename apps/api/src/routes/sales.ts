import { Hono } from "hono";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { catalogOptions, getDb, orderItems, orders, vendors, type Db } from "@vawe/db";
import { ORDER_SOURCES, type ProductStat, type SalesDay, type SalesOverview, type SalesPoint, type SalesProducts, type SalesRange, type SalesSources } from "@vawe/shared";
import { addDays, daysBetween, eachDay, isDay, isMonth, monthBounds, shiftMonth, todayIST } from "../lib/dates";
import { fail } from "../lib/http";
import { requireAccess } from "../middleware/auth";
import type { AppEnv } from "../types";

// Sales reports. "Value" is what the order is worth before GST (subtotal less discount), by order
// date, and cancelled orders don't count.
export const salesRoutes = new Hono<AppEnv>();
const view = requireAccess("sales", "view");

const value = sql<number>`(${orders.subtotal} - ${orders.discountAmount})`;
const r0 = (n: number) => Math.round(n);

async function daily(db: Db, from: string, to: string): Promise<SalesPoint[]> {
  const rows = await db
    .select({ date: orders.orderDate, orders: sql<number>`count(*)`.mapWith(Number), value: sql<number>`sum(${value})`.mapWith(Number) })
    .from(orders)
    .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .groupBy(orders.orderDate);
  const map = new Map(rows.map((r) => [r.date, r]));
  return eachDay(from, to).map((date) => ({ date, orders: map.get(date)?.orders ?? 0, value: r0(map.get(date)?.value ?? 0) }));
}

const sum = (points: SalesPoint[]) => ({ orders: points.reduce((s, p) => s + p.orders, 0), value: points.reduce((s, p) => s + p.value, 0) });

salesRoutes.get("/sales/overview", view, async (c) => {
  const today = todayIST();
  const month = isMonth(c.req.query("month")) ? c.req.query("month")! : today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const db = await getDb();

  const days = await daily(db, from, to);
  // Like-for-like: last month up to the same day of the month.
  const dayOfMonth = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : days.length;
  const prev = monthBounds(shiftMonth(month, -1));
  const prevTo = addDays(prev.from, Math.min(dayOfMonth, daysBetween(prev.from, prev.to) + 1) - 1);
  const lastMonthToDate = sum(await daily(db, prev.from, prevTo));

  const months = [-3, -2, -1, 0].map((n) => shiftMonth(month, n));
  const monthly = await Promise.all(
    months.map(async (m) => {
      const b = monthBounds(m);
      return { month: m, ...sum(await daily(db, b.from, b.to)) };
    }),
  );

  const overview: SalesOverview = { month, thisMonth: sum(days), lastMonthToDate, daily: days, monthly };
  return c.json(overview);
});

/** Day by day over any range (e.g. Oct 1 – Nov 1), with the same number of days just before it. */
salesRoutes.get("/sales/range", view, async (c) => {
  const q = c.req.query();
  if (!isDay(q.from) || !isDay(q.to)) fail(400, "Pick a start and end date");
  if (q.from > q.to) fail(400, "The start date is after the end date");
  const length = daysBetween(q.from, q.to) + 1;
  if (length > 366) fail(400, "Pick a range of a year or less");
  const db = await getDb();
  const current = await daily(db, q.from, q.to);
  const previous = await daily(db, addDays(q.from, -length), addDays(q.from, -1));
  const range: SalesRange = { from: q.from, to: q.to, current, previous, totals: sum(current), previousTotals: sum(previous) };
  return c.json(range);
});

/** Any set of days side by side (e.g. 1 Sept, 1 Oct, 1 Nov): totals and the orders on each. */
salesRoutes.get("/sales/days", view, async (c) => {
  const dates = [...new Set((c.req.query("dates") ?? "").split(",").map((d) => d.trim()).filter(isDay))].sort();
  if (!dates.length) fail(400, "Pick at least one date");
  if (dates.length > 12) fail(400, "Compare up to 12 dates at a time");
  const db = await getDb();
  const rows = await db
    .select({
      id: orders.id,
      code: orders.code,
      date: orders.orderDate,
      vendorName: vendors.firmName,
      customerName: orders.customerName,
      value,
      shutters: sql<number>`(select coalesce(sum(${orderItems.quantity}), 0) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(vendors, eq(vendors.id, orders.vendorId))
    .where(and(ne(orders.stage, "cancelled"), inArray(orders.orderDate, dates)))
    .orderBy(orders.code);
  const days: SalesDay[] = dates.map((date) => {
    const mine = rows.filter((r) => r.date === date);
    return {
      date,
      orders: mine.length,
      value: r0(mine.reduce((s, r) => s + Number(r.value), 0)),
      shutters: mine.reduce((s, r) => s + r.shutters, 0),
      list: mine.map((r) => ({ id: r.id, code: r.code, vendorName: r.vendorName, customerName: r.customerName, value: r0(Number(r.value)) })),
    };
  });
  return c.json(days);
});

function bounds(q: Record<string, string>) {
  const today = todayIST();
  return { from: isDay(q.from) ? q.from : addDays(today, -89), to: isDay(q.to) ? q.to : today };
}

salesRoutes.get("/sales/products", view, async (c) => {
  const { from, to } = bounds(c.req.query());
  const db = await getDb();
  const rows = await db
    .select({
      orderId: orders.id,
      orderDate: orders.orderDate,
      discountPercent: orders.discountPercent,
      orderType: orderItems.orderType,
      frameType: orderItems.frameType,
      glassType: orderItems.glassType,
      handleType: orderItems.handleType,
      quantity: orderItems.quantity,
      sqft: orderItems.sqft,
      amount: orderItems.amount,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, from), lte(orders.orderDate, to)));

  // Every active option appears, so products that didn't sell show as zero.
  const options = await db.select({ kind: catalogOptions.kind, name: catalogOptions.name }).from(catalogOptions).where(eq(catalogOptions.isActive, true));

  const build = (key: "orderType" | "frameType" | "glassType" | "handleType", kind: string): ProductStat[] => {
    const map = new Map<string, ProductStat & { orderIds: Set<string> }>();
    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, { name, orders: 0, shutters: 0, sqft: 0, value: 0, lastSold: null, orderIds: new Set() });
      return map.get(name)!;
    };
    for (const o of options) if (o.kind === kind) ensure(o.name);
    for (const r of rows) {
      const s = ensure(r[key]);
      s.orderIds.add(r.orderId);
      s.shutters += r.quantity;
      s.sqft += r.sqft;
      s.value += r.amount * (1 - r.discountPercent / 100);
      if (!s.lastSold || r.orderDate > s.lastSold) s.lastSold = r.orderDate;
    }
    return [...map.values()]
      .map(({ orderIds, ...s }) => ({ ...s, orders: orderIds.size, sqft: Math.round(s.sqft * 10) / 10, value: r0(s.value) }))
      .sort((a, b) => b.value - a.value || b.shutters - a.shutters || a.name.localeCompare(b.name));
  };

  const products: SalesProducts = {
    orderTypes: build("orderType", "order_type"),
    frameTypes: build("frameType", "frame_type"),
    glassTypes: build("glassType", "glass_type"),
    handleTypes: build("handleType", "handle_type"),
  };
  return c.json(products);
});

salesRoutes.get("/sales/sources", view, async (c) => {
  const { from, to } = bounds(c.req.query());
  const db = await getDb();
  const rows = await db
    .select({ source: orders.source, detail: orders.sourceDetail, orders: sql<number>`count(*)`.mapWith(Number), value: sql<number>`sum(${value})`.mapWith(Number) })
    .from(orders)
    .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .groupBy(orders.source, orders.sourceDetail);
  const result: SalesSources = {
    sources: ORDER_SOURCES.map((source) => {
      const mine = rows.filter((r) => r.source === source);
      return {
        source,
        orders: mine.reduce((s, r) => s + r.orders, 0),
        value: r0(mine.reduce((s, r) => s + r.value, 0)),
        details: mine.filter((r) => r.detail).map((r) => ({ detail: r.detail!, orders: r.orders, value: r0(r.value) })),
      };
    }),
  };
  return c.json(result);
});
