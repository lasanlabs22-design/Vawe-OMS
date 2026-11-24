import { Hono } from "hono";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { expenses, getDb, orderEvents, orderItems, orderReturns, orders, payments, users, vendors, type Db } from "@vawe/db";
import {
  cancelSchema,
  estimate,
  estimatePreviewSchema,
  holdSchema,
  materialUsage,
  noteSchema,
  ORDER_STAGES,
  orderSchema,
  PAYMENT_TERM_DAYS,
  PRODUCTION_STAGES,
  stageChangeSchema,
  stagePhase,
  STAGE_LABELS,
  type Catalog,
  type Estimate,
  type GlassGroup,
  type OrderBoard,
  type OrderDetail,
  type OrderFamily,
  type OrderInsights,
  type OrderItemInput,
  type OrderListItem,
  type OrderStage,
  type PricedItemInput,
} from "@vawe/shared";
import { nextOrderCode } from "../lib/counters";
import { addDays, addWorkdays, isDay, todayIST } from "../lib/dates";
import { fail, idParam, readBody } from "../lib/http";
import { getDefaultRates } from "../lib/settings";
import { requireAccess } from "../middleware/auth";
import type { AppEnv } from "../types";
import { loadCatalog } from "./catalog";

export const orderRoutes = new Hono<AppEnv>();
const view = requireAccess("order", "view");
const edit = requireAccess("order", "edit");

// ---------- Reading ----------

export interface OrderFilter {
  vendorId?: string;
  stage?: OrderStage;
  phase?: "pre" | "production" | "done" | "active";
  onHold?: boolean;
  q?: string;
  from?: string;
  to?: string;
  ids?: string[];
}

export async function listOrders(db: Db, f: OrderFilter = {}): Promise<OrderListItem[]> {
  const conds: SQL[] = [];
  if (f.vendorId) conds.push(eq(orders.vendorId, f.vendorId));
  if (f.stage) conds.push(eq(orders.stage, f.stage));
  if (f.onHold !== undefined) conds.push(eq(orders.onHold, f.onHold));
  if (f.from) conds.push(gte(orders.orderDate, f.from));
  if (f.to) conds.push(lte(orders.orderDate, f.to));
  if (f.ids) conds.push(inArray(orders.id, f.ids.length ? f.ids : ["00000000-0000-0000-0000-000000000000"]));
  if (f.phase === "active") conds.push(sql`${orders.stage} not in ('delivered', 'cancelled')`);
  if (f.phase === "pre") conds.push(inArray(orders.stage, ["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"]));
  if (f.phase === "production") conds.push(inArray(orders.stage, PRODUCTION_STAGES));
  if (f.phase === "done") conds.push(inArray(orders.stage, ["dispatched", "delivered"]));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(orders.code, like), ilike(orders.customerName, like), ilike(orders.projectName, like), ilike(orders.location, like), ilike(vendors.firmName, like))!);
  }

  const paidSq = db
    .select({ orderId: payments.orderId, paid: sql<number>`sum(${payments.amount})`.as("paid") })
    .from(payments)
    .groupBy(payments.orderId)
    .as("paid_sq");
  const qtySq = db
    .select({ orderId: orderItems.orderId, shutters: sql<number>`sum(${orderItems.quantity})`.as("shutters") })
    .from(orderItems)
    .groupBy(orderItems.orderId)
    .as("qty_sq");

  const rows = await db
    .select({
      o: orders,
      vendorName: vendors.firmName,
      paid: sql<number>`coalesce(${paidSq.paid}, 0)`.mapWith(Number),
      shutters: sql<number>`coalesce(${qtySq.shutters}, 0)`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(vendors, eq(vendors.id, orders.vendorId))
    .leftJoin(paidSq, eq(paidSq.orderId, orders.id))
    .leftJoin(qtySq, eq(qtySq.orderId, orders.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.orderDate), desc(orders.createdAt))
    .limit(1000);

  return rows.map(({ o, vendorName, paid, shutters }) => ({
    id: o.id,
    code: o.code,
    vendorId: o.vendorId,
    vendorName,
    customerName: o.customerName,
    projectName: o.projectName,
    location: o.location,
    stage: o.stage,
    onHold: o.onHold,
    holdReason: o.holdReason,
    orderDate: o.orderDate,
    expectedDelivery: o.expectedDelivery,
    total: o.total,
    paid,
    shutters,
    stageChangedAt: o.stageChangedAt.toISOString(),
  }));
}

orderRoutes.get("/orders", view, async (c) => {
  const q = c.req.query();
  const db = await getDb();
  return c.json(
    await listOrders(db, {
      q: q.q?.trim() || undefined,
      stage: ORDER_STAGES.includes(q.stage as OrderStage) ? (q.stage as OrderStage) : undefined,
      phase: ["pre", "production", "done", "active"].includes(q.phase ?? "") ? (q.phase as OrderFilter["phase"]) : undefined,
      onHold: q.hold === "1" ? true : undefined,
      vendorId: q.vendorId || undefined,
      from: isDay(q.from) ? q.from : undefined,
      to: isDay(q.to) ? q.to : undefined,
    }),
  );
});

orderRoutes.get("/orders/board", view, async (c) => {
  const db = await getDb();
  const rows = await db
    .select({ stage: orders.stage, onHold: orders.onHold, expected: orders.expectedDelivery })
    .from(orders)
    .where(ne(orders.stage, "cancelled"));
  const counts = Object.fromEntries(ORDER_STAGES.map((s) => [s, 0])) as Record<OrderStage, number>;
  const today = todayIST();
  let onHold = 0;
  let overdueDelivery = 0;
  for (const r of rows) {
    counts[r.stage]++;
    if (r.onHold) onHold++;
    if (r.expected && r.expected < today && !["dispatched", "delivered"].includes(r.stage)) overdueDelivery++;
  }
  const board: OrderBoard = { counts, onHold, overdueDelivery };
  return c.json(board);
});

orderRoutes.get("/orders/insights", view, async (c) => {
  const db = await getDb();
  const today = todayIST();
  const now = Date.now();
  const active = await db
    .select({
      id: orders.id,
      code: orders.code,
      stage: orders.stage,
      onHold: orders.onHold,
      holdReason: orders.holdReason,
      heldAt: orders.heldAt,
      expected: orders.expectedDelivery,
      stageChangedAt: orders.stageChangedAt,
      vendorName: vendors.firmName,
    })
    .from(orders)
    .innerJoin(vendors, eq(vendors.id, orders.vendorId))
    .where(sql`${orders.stage} not in ('delivered', 'cancelled')`);

  const daysSince = (d: Date | null) => (d ? Math.floor((now - d.getTime()) / 86_400_000) : 0);
  const pre = ["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"];
  const stageList = ORDER_STAGES.filter((s) => s !== "delivered" && s !== "cancelled");

  const mixRows = active.length
    ? await db
        .select({ orderType: orderItems.orderType, shutters: sql<number>`sum(${orderItems.quantity})`.mapWith(Number) })
        .from(orderItems)
        .where(inArray(orderItems.orderId, active.map((a) => a.id)))
        .groupBy(orderItems.orderType)
    : [];

  const from = addDays(today, -83);
  const perDay = await db
    .select({ date: orders.orderDate, n: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(and(ne(orders.stage, "cancelled"), gte(orders.orderDate, from)))
    .groupBy(orders.orderDate);
  const dayMap = new Map(perDay.map((r) => [r.date, r.n]));
  const intake: OrderInsights["intake"] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) intake.push({ date: d, count: dayMap.get(d) ?? 0 });

  const notOut = active.filter((a) => a.stage !== "dispatched");
  const insights: OrderInsights = {
    phases: {
      pre: active.filter((a) => pre.includes(a.stage)).length,
      production: active.filter((a) => !pre.includes(a.stage) && a.stage !== "dispatched").length,
      dispatched: active.filter((a) => a.stage === "dispatched").length,
    },
    stages: stageList.map((stage) => ({ stage, count: active.filter((a) => a.stage === stage).length })),
    delivery: {
      late: notOut.filter((a) => a.expected && a.expected < today).length,
      onTrack: notOut.filter((a) => a.expected && a.expected >= today).length,
      noDate: notOut.filter((a) => !a.expected).length,
    },
    onHold: active
      .filter((a) => a.onHold)
      .map((a) => ({ id: a.id, code: a.code, vendorName: a.vendorName, reason: a.holdReason, daysHeld: daysSince(a.heldAt) }))
      .sort((a, b) => b.daysHeld - a.daysHeld),
    waiting: active
      .map((a) => ({ id: a.id, code: a.code, vendorName: a.vendorName, stage: a.stage, days: daysSince(a.stageChangedAt), onHold: a.onHold }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 6),
    mix: mixRows.sort((a, b) => b.shutters - a.shutters),
    intake,
  };
  return c.json(insights);
});

export async function loadOrderDetail(db: Db, id: string): Promise<OrderDetail | null> {
  const creator = alias(users, "creator");
  const [row] = await db
    .select({ o: orders, v: vendors, createdByName: creator.name })
    .from(orders)
    .innerJoin(vendors, eq(vendors.id, orders.vendorId))
    .leftJoin(creator, eq(creator.id, orders.createdBy))
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) return null;
  const { o, v } = row;

  const [items, events, pays, rets, exps] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position)),
    db
      .select({ e: orderEvents, userName: users.name })
      .from(orderEvents)
      .leftJoin(users, eq(users.id, orderEvents.userId))
      .where(eq(orderEvents.orderId, id))
      .orderBy(desc(orderEvents.createdAt)),
    db
      .select({ p: payments, recordedByName: users.name })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedBy))
      .where(eq(payments.orderId, id))
      .orderBy(desc(payments.paidOn)),
    db
      .select({ r: orderReturns, recordedByName: users.name })
      .from(orderReturns)
      .leftJoin(users, eq(users.id, orderReturns.recordedBy))
      .where(eq(orderReturns.orderId, id))
      .orderBy(desc(orderReturns.returnedOn)),
    db
      .select({ x: expenses, recordedByName: users.name })
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.recordedBy))
      .where(eq(expenses.orderId, id))
      .orderBy(desc(expenses.spentOn)),
  ]);

  const paid = pays.reduce((s, p) => s + p.p.amount, 0);
  const credited = rets.reduce((s, r) => s + r.r.amount, 0);
  return {
    id: o.id,
    code: o.code,
    vendorId: o.vendorId,
    vendorName: v.firmName,
    vendorCode: v.code,
    vendorIsWalkIn: v.isWalkIn,
    vendorPaymentTerms: v.paymentTerms,
    vendorPricingModel: v.pricingModel,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    projectName: o.projectName,
    location: o.location,
    pmName: o.pmName,
    pmPhone: o.pmPhone,
    source: o.source,
    sourceDetail: o.sourceDetail,
    stage: o.stage,
    onHold: o.onHold,
    holdReason: o.holdReason,
    heldAt: o.heldAt?.toISOString() ?? null,
    orderDate: o.orderDate,
    expectedDelivery: o.expectedDelivery,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    dueDate: o.dueDate,
    notes: o.notes,
    cancelReason: o.cancelReason,
    subtotal: o.subtotal,
    discountPercent: o.discountPercent,
    discountAmount: o.discountAmount,
    gstPercent: o.gstPercent,
    gstAmount: o.gstAmount,
    total: o.total,
    pricing: o.pricing,
    paid,
    credited,
    balance: Math.max(0, Math.round((o.total - paid - credited) * 100) / 100),
    shutters: items.reduce((s, i) => s + i.quantity, 0),
    stageChangedAt: o.stageChangedAt.toISOString(),
    items: items.map((i) => ({ ...i })),
    events: events.map(({ e, userName }) => ({
      id: e.id,
      kind: e.kind,
      fromStage: e.fromStage,
      toStage: e.toStage,
      note: e.note,
      userName,
      createdAt: e.createdAt.toISOString(),
    })),
    payments: pays.map(({ p, recordedByName }) => ({
      id: p.id,
      orderId: p.orderId,
      orderCode: o.code,
      vendorId: p.vendorId,
      vendorName: v.firmName,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      paidOn: p.paidOn,
      note: p.note,
      recordedByName,
    })),
    returns: rets.map(({ r, recordedByName }) => ({
      id: r.id,
      orderId: r.orderId,
      orderCode: o.code,
      vendorName: v.firmName,
      amount: r.amount,
      items: r.items,
      reason: r.reason,
      returnedOn: r.returnedOn,
      recordedByName,
    })),
    expenses: exps.map(({ x, recordedByName }) => ({
      id: x.id,
      category: x.category,
      orderId: x.orderId,
      orderCode: o.code,
      amount: x.amount,
      spentOn: x.spentOn,
      description: x.description,
      recordedByName,
    })),
    materials: materialUsage(items),
    createdByName: row.createdByName,
    createdAt: o.createdAt.toISOString(),
  };
}

orderRoutes.get("/orders/:id", view, async (c) => {
  const detail = await loadOrderDetail(await getDb(), idParam(c));
  if (!detail) fail(404, "Order not found");
  return c.json(detail);
});

// ---------- Items: catalogue checks and pricing ----------

type ResolvedItem = Required<Omit<OrderItemInput, "widthMm" | "heightMm" | "hingeHoles" | "quantity">> & {
  widthMm: number;
  heightMm: number;
  hingeHoles: number;
  quantity: number;
  family: OrderFamily;
  glassGroup: GlassGroup;
};

const SLIDING_DIVIDERS = ["top only", "bottom only", "top and bottom", "double center line", "no divider"];

/**
 * Checks each item against the catalogue and the workbook's rules, and fills in how it's priced.
 * `allowInactive` lets an existing order keep options that have since been switched off.
 */
function resolveItems(catalog: Catalog, items: (OrderItemInput & { widthMm: number; heightMm: number; hingeHoles: number; quantity: number })[], allowInactive: Set<string>): ResolvedItem[] {
  const pick = <T extends { name: string; isActive: boolean }>(list: T[], name: string, what: string, row: number): T => {
    const found = list.find((x) => x.name === name);
    if (!found || (!found.isActive && !allowInactive.has(`${what}:${name}`))) fail(400, `Item ${row}: "${name}" isn't a current ${what}`, { field: `items.${row - 1}` });
    return found;
  };
  return items.map((it, i) => {
    const row = i + 1;
    const ot = pick(catalog.orderTypes, it.orderType, "order type", row);
    pick(catalog.frameTypes, it.frameType, "frame type", row);
    pick(catalog.frameColours, it.frameColour, "frame colour", row);
    const glass = pick(catalog.glassTypes, it.glassType, "glass type", row);
    pick(catalog.handlePositions, it.handlePosition, "handle position", row);
    pick(ot.handleTypes, it.handleType, `handle type for ${ot.name}`, row);
    pick(catalog.dividers, it.divider, "divider", row);

    // Rules carried over from the workbook's validation.
    const pos = it.handlePosition.toLowerCase();
    const div = it.divider.toLowerCase();
    if ((pos === "top" || pos === "bottom") && div !== "no divider") {
      fail(400, `Item ${row}: with the handle at the ${pos}, the divider must be "No Divider"`, { field: `items.${i}` });
    }
    if (ot.family !== "profile_shutter" && !SLIDING_DIVIDERS.includes(div)) {
      fail(400, `Item ${row}: ${ot.name} only takes Top Only, Bottom Only, Top and Bottom, Double Center Line or No Divider`, { field: `items.${i}` });
    }
    return { ...it, family: ot.family, glassGroup: glass.glassGroup } as ResolvedItem;
  });
}

async function priceItems(db: Db, vendorId: string, items: PricedItemInput[]): Promise<Estimate> {
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!v) fail(400, "Choose a vendor", { field: "vendorId" });
  const fallback = await getDefaultRates(db);
  // Walk-in customers are priced from the default list as an RFT/SQFT vendor would be.
  return estimate(items, { pricingModel: v.pricingModel, rates: v.isWalkIn ? {} : v.rates, discountPercent: v.discountPercent }, fallback);
}

/** Live price while the order form is being filled in. Incomplete rows are skipped. */
orderRoutes.post("/orders/estimate", view, async (c) => {
  const { vendorId, items } = await readBody(c, estimatePreviewSchema);
  const catalog = await loadCatalog();
  const priced: PricedItemInput[] = [];
  for (const it of items) {
    const ot = catalog.orderTypes.find((o) => o.name === it.orderType);
    const glass = catalog.glassTypes.find((g) => g.name === it.glassType);
    if (!ot || !glass || !it.widthMm || !it.heightMm || !it.quantity) continue;
    priced.push({
      family: ot.family,
      glassGroup: glass.glassGroup,
      frameType: it.frameType ?? "",
      handleType: it.handleType ?? "",
      glassType: glass.name,
      widthMm: Number(it.widthMm),
      heightMm: Number(it.heightMm),
      quantity: Number(it.quantity),
    });
  }
  return c.json(await priceItems(await getDb(), vendorId, priced));
});

async function writeItems(db: Db, orderId: string, items: ResolvedItem[], est: Estimate) {
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.insert(orderItems).values(
    items.map((it, i) => ({
      orderId,
      position: i + 1,
      orderType: it.orderType,
      family: it.family,
      frameType: it.frameType,
      frameColour: it.frameColour,
      glassType: it.glassType,
      glassGroup: it.glassGroup,
      widthMm: it.widthMm,
      heightMm: it.heightMm,
      handlePosition: it.handlePosition,
      handleType: it.handleType,
      divider: it.divider,
      hingeHoles: it.hingeHoles,
      quantity: it.quantity,
      sqft: est.itemSqft[i] ?? 0,
      amount: est.itemAmounts[i] ?? 0,
    })),
  );
}

const totalsOf = (est: Estimate) => ({
  subtotal: est.subtotal,
  discountPercent: est.discountPercent,
  discountAmount: est.discountAmount,
  gstPercent: est.gstPercent,
  gstAmount: est.gstAmount,
  total: est.total,
  pricing: est,
});

// ---------- Writing ----------

orderRoutes.post("/orders", edit, async (c) => {
  const me = c.get("user");
  const input = await readBody(c, orderSchema);
  if (input.sourceDetail && !input.source) fail(400, "Choose where the order came from", { field: "source" });
  const db = await getDb();
  const items = resolveItems(await loadCatalog(), input.items, new Set());
  const est = await priceItems(db, input.vendorId, items);

  const id = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [order] = await t
      .insert(orders)
      .values({
        code: await nextOrderCode(t, input.orderDate),
        vendorId: input.vendorId,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        projectName: input.projectName ?? null,
        location: input.location ?? null,
        pmName: input.pmName ?? null,
        pmPhone: input.pmPhone ?? null,
        source: input.source,
        sourceDetail: input.sourceDetail ?? null,
        orderDate: input.orderDate,
        // The workbook's rule: two working days after the order date, unless set.
        expectedDelivery: input.expectedDelivery ?? addWorkdays(input.orderDate, 2),
        notes: input.notes ?? null,
        createdBy: me.id,
        ...totalsOf(est),
      })
      .returning({ id: orders.id });
    await writeItems(t, order!.id, items, est);
    await t.insert(orderEvents).values({ orderId: order!.id, kind: "created", toStage: "design", userId: me.id });
    return order!.id;
  });

  return c.json(await loadOrderDetail(db, id), 201);
});

orderRoutes.patch("/orders/:id", edit, async (c) => {
  const me = c.get("user");
  const id = idParam(c);
  const input = await readBody(c, orderSchema);
  const db = await getDb();
  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) fail(404, "Order not found");
  if (existing.stage === "cancelled") fail(409, "This order is cancelled");

  const oldItems = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position));
  const itemsChanged =
    input.vendorId !== existing.vendorId ||
    JSON.stringify(input.items.map(itemKey)) !== JSON.stringify(oldItems.map(itemKey));
  if (itemsChanged && stagePhase(existing.stage) !== "pre") {
    fail(409, `Items and vendor can only change before production. Move the order back to "${STAGE_LABELS.awaiting_payment}" first.`);
  }

  // Options already on this order may stay even if switched off in the catalogue since.
  const keep = new Set(oldItems.flatMap((i) => [`order type:${i.orderType}`, `frame type:${i.frameType}`, `frame colour:${i.frameColour}`, `glass type:${i.glassType}`, `handle position:${i.handlePosition}`, `handle type for ${i.orderType}:${i.handleType}`, `divider:${i.divider}`]));

  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const details = {
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      projectName: input.projectName ?? null,
      location: input.location ?? null,
      pmName: input.pmName ?? null,
      pmPhone: input.pmPhone ?? null,
      source: input.source,
      sourceDetail: input.sourceDetail ?? null,
      orderDate: input.orderDate,
      expectedDelivery: input.expectedDelivery ?? existing.expectedDelivery,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    };
    if (itemsChanged) {
      const items = resolveItems(await loadCatalog(), input.items, keep);
      const est = await priceItems(t, input.vendorId, items);
      await t.update(orders).set({ ...details, vendorId: input.vendorId, ...totalsOf(est) }).where(eq(orders.id, id));
      await writeItems(t, id, items, est);
    } else {
      await t.update(orders).set(details).where(eq(orders.id, id));
    }
    await t.insert(orderEvents).values({ orderId: id, kind: "edited", note: itemsChanged ? "Items or vendor changed; estimate recalculated" : "Details updated", userId: me.id });
  });

  return c.json(await loadOrderDetail(db, id));
});

function itemKey(i: { orderType: string; frameType: string; frameColour: string; glassType: string; widthMm: number | string; heightMm: number | string; handlePosition: string; handleType: string; divider: string; hingeHoles: number | string; quantity: number | string }) {
  return [i.orderType, i.frameType, i.frameColour, i.glassType, Number(i.widthMm), Number(i.heightMm), i.handlePosition, i.handleType, i.divider, Number(i.hingeHoles), Number(i.quantity)].join("|");
}

/** Recalculate with the vendor's current rates (e.g. after a price change), before production only. */
orderRoutes.post("/orders/:id/reprice", edit, async (c) => {
  const id = idParam(c);
  const db = await getDb();
  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) fail(404, "Order not found");
  if (stagePhase(existing.stage) !== "pre") fail(409, "Prices are fixed once production starts");
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position));
  const est = await priceItems(db, existing.vendorId, items);
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await t.update(orders).set({ ...totalsOf(est), updatedAt: new Date() }).where(eq(orders.id, id));
    for (const [i, it] of items.entries()) {
      await t.update(orderItems).set({ sqft: est.itemSqft[i] ?? 0, amount: est.itemAmounts[i] ?? 0 }).where(eq(orderItems.id, it.id));
    }
    await t.insert(orderEvents).values({ orderId: id, kind: "edited", note: "Estimate recalculated with current rates", userId: c.get("user").id });
  });
  return c.json(await loadOrderDetail(db, id));
});

orderRoutes.post("/orders/:id/stage", edit, async (c) => {
  const me = c.get("user");
  const id = idParam(c);
  const { stage, note } = await readBody(c, stageChangeSchema);
  if (stage === "cancelled") fail(400, "Use cancel to cancel an order");
  const db = await getDb();
  const [o] = await db
    .select({ o: orders, terms: vendors.paymentTerms, days: vendors.paymentDays })
    .from(orders)
    .innerJoin(vendors, eq(vendors.id, orders.vendorId))
    .where(eq(orders.id, id))
    .limit(1);
  if (!o) fail(404, "Order not found");
  if (o.o.stage === "cancelled") fail(409, "This order is cancelled");
  if (o.o.stage === stage) return c.json(await loadOrderDetail(db, id));
  if (o.o.onHold && stagePhase(stage) === "production" && stagePhase(o.o.stage) === "production" && ORDER_STAGES.indexOf(stage) > ORDER_STAGES.indexOf(o.o.stage)) {
    fail(409, "This order is on hold for procurement. Release the hold before moving it forward.");
  }

  const patch: Partial<typeof orders.$inferInsert> = { stage, stageChangedAt: new Date(), updatedAt: new Date() };
  if (stage === "delivered") {
    const today = todayIST();
    const termDays = o.terms === "custom" ? (o.days ?? 0) : PAYMENT_TERM_DAYS[o.terms];
    patch.deliveredAt = new Date();
    patch.dueDate = addDays(today, termDays);
    patch.onHold = false;
  } else if (o.o.stage === "delivered") {
    // Moved back from delivered: it isn't due any more.
    patch.deliveredAt = null;
    patch.dueDate = null;
  }
  await db.update(orders).set(patch).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, kind: "stage", fromStage: o.o.stage, toStage: stage, note: note ?? null, userId: me.id });
  return c.json(await loadOrderDetail(db, id));
});

orderRoutes.post("/orders/:id/hold", edit, async (c) => {
  const id = idParam(c);
  const { reason } = await readBody(c, holdSchema);
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) fail(404, "Order not found");
  if (["delivered", "cancelled", "dispatched"].includes(o.stage)) fail(409, "Only orders still being made can be put on hold");
  await db.update(orders).set({ onHold: true, holdReason: reason, heldAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, kind: "hold", note: reason, userId: c.get("user").id });
  return c.json(await loadOrderDetail(db, id));
});

orderRoutes.post("/orders/:id/release", edit, async (c) => {
  const id = idParam(c);
  const { note } = await readBody(c, noteSchema);
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) fail(404, "Order not found");
  if (!o.onHold) return c.json(await loadOrderDetail(db, id));
  await db.update(orders).set({ onHold: false, holdReason: null, heldAt: null, updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, kind: "release", note: note ?? "Materials arrived", userId: c.get("user").id });
  return c.json(await loadOrderDetail(db, id));
});

orderRoutes.post("/orders/:id/cancel", edit, async (c) => {
  const id = idParam(c);
  const { reason } = await readBody(c, cancelSchema);
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) fail(404, "Order not found");
  if (o.stage === "delivered") fail(409, "Delivered orders can't be cancelled; record a return instead");
  if (o.stage === "cancelled") return c.json(await loadOrderDetail(db, id));
  await db.update(orders).set({ stage: "cancelled", cancelReason: reason, onHold: false, stageChangedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, kind: "cancelled", fromStage: o.stage, toStage: "cancelled", note: reason, userId: c.get("user").id });
  return c.json(await loadOrderDetail(db, id));
});
