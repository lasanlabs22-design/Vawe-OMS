import { and, inArray, ne, sql } from "drizzle-orm";
import { orderReturns, orders, payments, type Db } from "@vawe/db";
import type { VendorHealth, VendorStats } from "@vawe/shared";
import { daysBetween, todayIST } from "./dates";

// Who owes what. An order's balance is its total minus payments and return credits. Payment falls due
// on the order's due date (set at delivery from the vendor's terms); orders not yet delivered aren't
// due, so they count as outstanding but never as overdue.

export interface LedgerOrder {
  id: string;
  code: string;
  vendorId: string;
  stage: string;
  orderDate: string;
  total: number;
  dueDate: string | null;
  deliveredAt: Date | null;
  paid: number;
  credited: number;
  /** Payments in date order, to work out when the balance was cleared. */
  paymentDays: { day: string; amount: number }[];
}

export async function loadLedger(db: Db, filter?: { vendorIds?: string[] }): Promise<LedgerOrder[]> {
  const where = filter?.vendorIds
    ? and(ne(orders.stage, "cancelled"), inArray(orders.vendorId, filter.vendorIds.length ? filter.vendorIds : ["00000000-0000-0000-0000-000000000000"]))
    : ne(orders.stage, "cancelled");
  const rows = await db
    .select({
      id: orders.id,
      code: orders.code,
      vendorId: orders.vendorId,
      stage: orders.stage,
      orderDate: orders.orderDate,
      total: orders.total,
      dueDate: orders.dueDate,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .where(where);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const pays = await db
    .select({ orderId: payments.orderId, amount: payments.amount, paidOn: payments.paidOn })
    .from(payments)
    .where(inArray(payments.orderId, ids))
    .orderBy(payments.paidOn);
  const credits = await db
    .select({ orderId: orderReturns.orderId, amount: sql<number>`sum(${orderReturns.amount})`.mapWith(Number) })
    .from(orderReturns)
    .where(inArray(orderReturns.orderId, ids))
    .groupBy(orderReturns.orderId);

  const payMap = new Map<string, { day: string; amount: number }[]>();
  for (const p of pays) {
    const list = payMap.get(p.orderId) ?? [];
    list.push({ day: p.paidOn, amount: p.amount });
    payMap.set(p.orderId, list);
  }
  const creditMap = new Map(credits.map((c) => [c.orderId, c.amount]));

  return rows.map((r) => {
    const paymentDays = payMap.get(r.id) ?? [];
    return {
      ...r,
      paid: paymentDays.reduce((s, p) => s + p.amount, 0),
      credited: creditMap.get(r.id) ?? 0,
      paymentDays,
    };
  });
}

export const outstandingOf = (o: Pick<LedgerOrder, "total" | "paid" | "credited">) => Math.max(0, Math.round((o.total - o.paid - o.credited) * 100) / 100);

/** Days past due for an order still owing money (0 if not due yet or not owing). */
export function daysOverdue(o: LedgerOrder, today = todayIST()): number {
  if (!o.dueDate || outstandingOf(o) <= 0) return 0;
  return Math.max(0, daysBetween(o.dueDate, today));
}

/** When the balance was cleared (the payment that brought it to zero), or null if still owing. */
function clearedOn(o: LedgerOrder): string | null {
  let remaining = o.total - o.credited;
  if (remaining <= 0) return o.paymentDays[0]?.day ?? o.dueDate;
  for (const p of o.paymentDays) {
    remaining -= p.amount;
    if (remaining <= 0.009) return p.day;
  }
  return null;
}

/**
 * Health:  at risk  anything more than 30 days overdue
 *          watch    anything overdue, or under 70% of due orders paid on time
 *          good     otherwise
 *          new      nothing has fallen due yet
 */
export function vendorStats(list: LedgerOrder[], today = todayIST()): VendorStats {
  let billed = 0;
  let paid = 0;
  let outstanding = 0;
  let overdue = 0;
  let maxDaysOverdue = 0;
  let dueCount = 0;
  let onTime = 0;
  let lateDaysTotal = 0;
  let lastOrderDate: string | null = null;

  for (const o of list) {
    billed += o.total;
    paid += o.paid + o.credited;
    const owing = outstandingOf(o);
    outstanding += owing;
    if (!lastOrderDate || o.orderDate > lastOrderDate) lastOrderDate = o.orderDate;

    if (o.dueDate && o.dueDate <= today) {
      dueCount++;
      const cleared = clearedOn(o);
      const late = cleared ? Math.max(0, daysBetween(o.dueDate, cleared)) : daysBetween(o.dueDate, today);
      if (late === 0) onTime++;
      lateDaysTotal += late;
    }
    const od = daysOverdue(o, today);
    if (od > 0) {
      overdue += owing;
      maxDaysOverdue = Math.max(maxDaysOverdue, od);
    }
  }

  const onTimeRate = dueCount ? onTime / dueCount : null;
  let health: VendorHealth = "new";
  if (maxDaysOverdue > 30) health = "at_risk";
  else if (overdue > 0 || (onTimeRate !== null && onTimeRate < 0.7)) health = "watch";
  else if (dueCount > 0) health = "good";

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    orders: list.length,
    billed: r(billed),
    paid: r(paid),
    outstanding: r(outstanding),
    overdue: r(overdue),
    maxDaysOverdue,
    onTimeRate,
    avgDaysLate: dueCount ? Math.round((lateDaysTotal / dueCount) * 10) / 10 : null,
    lastOrderDate,
    health,
  };
}
