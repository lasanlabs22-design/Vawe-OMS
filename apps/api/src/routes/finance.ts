import { Hono } from "hono";
import { and, desc, eq, gte, ilike, lte, ne, or } from "drizzle-orm";
import { expenses, getDb, orderEvents, orderReturns, orders, payments, purchases, users, vendors } from "@vawe/db";
import {
  EXPENSE_CATEGORIES,
  expenseSchema,
  PAYMENT_METHODS,
  paymentSchema,
  purchaseSchema,
  returnSchema,
  type ExpenseView,
  type FinanceSummary,
  type OrderOption,
  type PaymentView,
  type PurchaseView,
  type Receivable,
  type ReturnView,
} from "@vawe/shared";
import { addDays, eachDay, isDay, todayIST } from "../lib/dates";
import { fail, idParam, readBody } from "../lib/http";
import { daysOverdue, loadLedger, outstandingOf } from "../lib/ledger";
import { requireAccess, requireAdmin } from "../middleware/auth";
import type { AppEnv } from "../types";

export const financeRoutes = new Hono<AppEnv>();
const view = requireAccess("finance", "view");
const edit = requireAccess("finance", "edit");

/** ?from&to, defaulting to the current month so far. */
function period(q: Record<string, string>): { from: string; to: string } {
  const today = todayIST();
  const from = isDay(q.from) ? q.from : `${today.slice(0, 7)}-01`;
  const to = isDay(q.to) ? q.to : today;
  if (from > to) fail(400, "The start date is after the end date");
  if (eachDay(from, to).length > 731) fail(400, "Pick a range of two years or less");
  return { from, to };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

financeRoutes.get("/finance/summary", view, async (c) => {
  const { from, to } = period(c.req.query());
  const db = await getDb();
  const today = todayIST();

  const [ledger, pays, exps, rets, purch] = await Promise.all([
    loadLedger(db),
    db.select({ amount: payments.amount, paidOn: payments.paidOn, method: payments.method }).from(payments).where(and(gte(payments.paidOn, from), lte(payments.paidOn, to))),
    db.select({ amount: expenses.amount, spentOn: expenses.spentOn, category: expenses.category }).from(expenses).where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to))),
    db.select({ amount: orderReturns.amount }).from(orderReturns).where(and(gte(orderReturns.returnedOn, from), lte(orderReturns.returnedOn, to))),
    db.select({ amount: purchases.amount }).from(purchases).where(and(gte(purchases.purchasedOn, from), lte(purchases.purchasedOn, to))),
  ]);

  let receivable = 0;
  let overdue = 0;
  const deliveredUnpaid = { count: 0, amount: 0 };
  const buckets = [
    { label: "Not due yet", amount: 0, count: 0 },
    { label: "1–30 days", amount: 0, count: 0 },
    { label: "31–60 days", amount: 0, count: 0 },
    { label: "60+ days", amount: 0, count: 0 },
  ];
  for (const o of ledger) {
    const owing = outstandingOf(o);
    if (owing <= 0) continue;
    receivable += owing;
    if (o.stage === "delivered") {
      deliveredUnpaid.count++;
      deliveredUnpaid.amount += owing;
    }
    const d = daysOverdue(o, today);
    if (d > 0) overdue += owing;
    const b = d === 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : 3;
    buckets[b]!.amount += owing;
    buckets[b]!.count++;
  }

  const days = eachDay(from, to);
  const received = new Map<string, number>(days.map((d) => [d, 0]));
  const spent = new Map<string, number>(days.map((d) => [d, 0]));
  for (const p of pays) received.set(p.paidOn, (received.get(p.paidOn) ?? 0) + p.amount);
  for (const e of exps) spent.set(e.spentOn, (spent.get(e.spentOn) ?? 0) + e.amount);

  const summary: FinanceSummary = {
    from,
    to,
    received: r2(pays.reduce((s, p) => s + p.amount, 0)),
    receivable: r2(receivable),
    overdue: r2(overdue),
    deliveredUnpaid: { count: deliveredUnpaid.count, amount: r2(deliveredUnpaid.amount) },
    aging: buckets.map((b) => ({ ...b, amount: r2(b.amount) })),
    expenses: EXPENSE_CATEGORIES.map((category) => ({ category, amount: r2(exps.filter((e) => e.category === category).reduce((s, e) => s + e.amount, 0)) })),
    expenseTotal: r2(exps.reduce((s, e) => s + e.amount, 0)),
    returns: r2(rets.reduce((s, r) => s + r.amount, 0)),
    purchases: r2(purch.reduce((s, p) => s + p.amount, 0)),
    daily: days.map((date) => ({ date, received: r2(received.get(date) ?? 0), expenses: r2(spent.get(date) ?? 0) })),
    receivedByMethod: PAYMENT_METHODS.map((method) => ({ method, amount: r2(pays.filter((p) => p.method === method).reduce((s, p) => s + p.amount, 0)) })),
  };
  return c.json(summary);
});

financeRoutes.get("/finance/receivables", view, async (c) => {
  const db = await getDb();
  const ledger = (await loadLedger(db)).filter((o) => outstandingOf(o) > 0);
  const names = new Map(
    (await db.select({ id: vendors.id, name: vendors.firmName }).from(vendors)).map((v) => [v.id, v.name]),
  );
  const today = todayIST();
  const list: Receivable[] = ledger
    .map((o) => ({
      orderId: o.id,
      orderCode: o.code,
      vendorId: o.vendorId,
      vendorName: names.get(o.vendorId) ?? "",
      stage: o.stage as Receivable["stage"],
      total: o.total,
      paid: r2(o.paid + o.credited),
      outstanding: outstandingOf(o),
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      dueDate: o.dueDate,
      daysOverdue: daysOverdue(o, today),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding);
  return c.json(list);
});

/** Orders to pick from when recording a payment, return or order expense (by code, vendor, customer). */
financeRoutes.get("/finance/order-options", view, async (c) => {
  const q = c.req.query("q")?.trim();
  const id = c.req.query("id");
  const db = await getDb();
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : null;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const [o] = await db
      .select({ id: orders.id, code: orders.code, vendorName: vendors.firmName, customerName: orders.customerName, total: orders.total })
      .from(orders)
      .innerJoin(vendors, eq(vendors.id, orders.vendorId))
      .where(eq(orders.id, id))
      .limit(1);
    if (!o) return c.json([]);
    const l = (await loadLedger(db)).find((x) => x.id === id);
    return c.json([{ ...o, outstanding: l ? outstandingOf(l) : o.total }]);
  }
  const rows = await db
    .select({ id: orders.id, code: orders.code, vendorName: vendors.firmName, customerName: orders.customerName, total: orders.total })
    .from(orders)
    .innerJoin(vendors, eq(vendors.id, orders.vendorId))
    .where(and(ne(orders.stage, "cancelled"), like ? or(ilike(orders.code, like), ilike(vendors.firmName, like), ilike(orders.customerName, like), ilike(orders.projectName, like)) : undefined))
    .orderBy(desc(orders.orderDate))
    .limit(25);
  const ledger = new Map((await loadLedger(db)).map((o) => [o.id, o]));
  const options: OrderOption[] = rows.map((r) => {
    const l = ledger.get(r.id);
    return { ...r, outstanding: l ? outstandingOf(l) : r.total };
  });
  return c.json(options);
});

// ---------- Payments ----------

financeRoutes.get("/payments", view, async (c) => {
  const { from, to } = period(c.req.query());
  const db = await getDb();
  const rows = await db
    .select({ p: payments, orderCode: orders.code, vendorName: vendors.firmName, recordedByName: users.name })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(vendors, eq(vendors.id, payments.vendorId))
    .leftJoin(users, eq(users.id, payments.recordedBy))
    .where(and(gte(payments.paidOn, from), lte(payments.paidOn, to)))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt));
  const list: PaymentView[] = rows.map(({ p, orderCode, vendorName, recordedByName }) => ({
    id: p.id,
    orderId: p.orderId,
    orderCode,
    vendorId: p.vendorId,
    vendorName,
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    paidOn: p.paidOn,
    note: p.note,
    recordedByName,
  }));
  return c.json(list);
});

financeRoutes.post("/payments", edit, async (c) => {
  const input = await readBody(c, paymentSchema);
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!o) fail(400, "Order not found", { field: "orderId" });
  if (o.stage === "cancelled") fail(409, "That order is cancelled");
  if (input.paidOn > addDays(todayIST(), 1)) fail(400, "The payment date is in the future", { field: "paidOn" });
  const me = c.get("user");
  const [row] = await db
    .insert(payments)
    .values({ orderId: o.id, vendorId: o.vendorId, amount: input.amount, method: input.method, reference: input.reference ?? null, paidOn: input.paidOn, note: input.note ?? null, recordedBy: me.id })
    .returning();
  await db.insert(orderEvents).values({ orderId: o.id, kind: "payment", note: `Payment of ₹${input.amount.toLocaleString("en-IN")} recorded (${input.method})`, userId: me.id });
  return c.json(row, 201);
});

financeRoutes.delete("/payments/:id", requireAdmin, async (c) => {
  const id = idParam(c);
  const db = await getDb();
  const [row] = await db.delete(payments).where(eq(payments.id, id)).returning();
  if (!row) fail(404, "Payment not found");
  await db.insert(orderEvents).values({ orderId: row.orderId, kind: "payment", note: `Payment of ₹${row.amount.toLocaleString("en-IN")} on ${row.paidOn} deleted`, userId: c.get("user").id });
  return c.json({ ok: true });
});

// ---------- Expenses ----------

financeRoutes.get("/expenses", view, async (c) => {
  const { from, to } = period(c.req.query());
  const db = await getDb();
  const rows = await db
    .select({ x: expenses, orderCode: orders.code, recordedByName: users.name })
    .from(expenses)
    .leftJoin(orders, eq(orders.id, expenses.orderId))
    .leftJoin(users, eq(users.id, expenses.recordedBy))
    .where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to)))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
  const list: ExpenseView[] = rows.map(({ x, orderCode, recordedByName }) => ({
    id: x.id,
    category: x.category,
    orderId: x.orderId,
    orderCode,
    amount: x.amount,
    spentOn: x.spentOn,
    description: x.description,
    recordedByName,
  }));
  return c.json(list);
});

financeRoutes.post("/expenses", edit, async (c) => {
  const input = await readBody(c, expenseSchema);
  const db = await getDb();
  if (input.orderId) {
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!o) fail(400, "Order not found", { field: "orderId" });
  }
  const [row] = await db
    .insert(expenses)
    .values({ category: input.category, orderId: input.orderId ?? null, amount: input.amount, spentOn: input.spentOn, description: input.description ?? null, recordedBy: c.get("user").id })
    .returning();
  return c.json(row, 201);
});

financeRoutes.delete("/expenses/:id", requireAdmin, async (c) => {
  const db = await getDb();
  const [row] = await db.delete(expenses).where(eq(expenses.id, idParam(c))).returning();
  if (!row) fail(404, "Expense not found");
  return c.json({ ok: true });
});

// ---------- Returns ----------

financeRoutes.get("/returns", view, async (c) => {
  const { from, to } = period(c.req.query());
  const db = await getDb();
  const rows = await db
    .select({ r: orderReturns, orderCode: orders.code, vendorName: vendors.firmName, recordedByName: users.name })
    .from(orderReturns)
    .innerJoin(orders, eq(orders.id, orderReturns.orderId))
    .innerJoin(vendors, eq(vendors.id, orderReturns.vendorId))
    .leftJoin(users, eq(users.id, orderReturns.recordedBy))
    .where(and(gte(orderReturns.returnedOn, from), lte(orderReturns.returnedOn, to)))
    .orderBy(desc(orderReturns.returnedOn));
  const list: ReturnView[] = rows.map(({ r, orderCode, vendorName, recordedByName }) => ({
    id: r.id,
    orderId: r.orderId,
    orderCode,
    vendorName,
    amount: r.amount,
    items: r.items,
    reason: r.reason,
    returnedOn: r.returnedOn,
    recordedByName,
  }));
  return c.json(list);
});

financeRoutes.post("/returns", edit, async (c) => {
  const input = await readBody(c, returnSchema);
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!o) fail(400, "Order not found", { field: "orderId" });
  const me = c.get("user");
  const [row] = await db
    .insert(orderReturns)
    .values({ orderId: o.id, vendorId: o.vendorId, amount: input.amount, items: input.items ?? null, reason: input.reason, returnedOn: input.returnedOn, recordedBy: me.id })
    .returning();
  await db.insert(orderEvents).values({ orderId: o.id, kind: "return", note: `Return recorded: ${input.reason}${input.amount ? ` (credit ₹${input.amount.toLocaleString("en-IN")})` : ""}`, userId: me.id });
  return c.json(row, 201);
});

// ---------- Purchases ----------

financeRoutes.get("/purchases", view, async (c) => {
  const { from, to } = period(c.req.query());
  const db = await getDb();
  const rows = await db
    .select({ p: purchases, recordedByName: users.name })
    .from(purchases)
    .leftJoin(users, eq(users.id, purchases.recordedBy))
    .where(and(gte(purchases.purchasedOn, from), lte(purchases.purchasedOn, to)))
    .orderBy(desc(purchases.purchasedOn));
  const list: PurchaseView[] = rows.map(({ p, recordedByName }) => ({
    id: p.id,
    supplierName: p.supplierName,
    invoiceNo: p.invoiceNo,
    purchasedOn: p.purchasedOn,
    amount: p.amount,
    description: p.description,
    recordedByName,
  }));
  return c.json(list);
});

financeRoutes.post("/purchases", edit, async (c) => {
  const input = await readBody(c, purchaseSchema);
  const db = await getDb();
  const [row] = await db
    .insert(purchases)
    .values({ supplierName: input.supplierName, invoiceNo: input.invoiceNo ?? null, purchasedOn: input.purchasedOn, amount: input.amount, description: input.description ?? null, recordedBy: c.get("user").id })
    .returning();
  return c.json(row, 201);
});

/** Recent purchases, for linking a stock-in to one (inventory is admin-only, so this is too). */
financeRoutes.get("/purchase-options", requireAdmin, async (c) => {
  const db = await getDb();
  const rows = await db
    .select({ id: purchases.id, supplierName: purchases.supplierName, invoiceNo: purchases.invoiceNo, purchasedOn: purchases.purchasedOn, amount: purchases.amount })
    .from(purchases)
    .orderBy(desc(purchases.purchasedOn))
    .limit(30);
  return c.json(rows);
});
