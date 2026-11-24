import { Hono } from "hono";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, users, vendorFollowups, vendors, type Db, type Vendor } from "@vawe/db";
import {
  followupSchema,
  followupUpdateSchema,
  settingsAccess,
  vendorSchema,
  type Followup,
  type OrderListItem,
  type VendorDetail,
  type VendorListItem,
} from "@vawe/shared";
import { nextVendorCode } from "../lib/counters";
import { shiftMonth, todayIST } from "../lib/dates";
import { lookupGstin } from "../lib/gst";
import { fail, idParam, readBody } from "../lib/http";
import { loadLedger, vendorStats } from "../lib/ledger";
import { requireAccess } from "../middleware/auth";
import type { AppEnv, AuthedUser } from "../types";
import { listOrders } from "./orders";

export const vendorRoutes = new Hono<AppEnv>();
const view = requireAccess("vendor", "view");
const edit = requireAccess("vendor", "edit");

function listItem(v: Vendor, stats: VendorListItem["stats"], openFollowups: number): VendorListItem {
  return {
    id: v.id,
    code: v.code,
    firmName: v.firmName,
    isWalkIn: v.isWalkIn,
    isActive: v.isActive,
    gstin: v.gstin,
    state: v.state,
    contact1Name: v.contact1Name,
    contact1Phone: v.contact1Phone,
    pricingModel: v.pricingModel,
    paymentTerms: v.paymentTerms,
    stats,
    openFollowups,
  };
}

async function openFollowupCounts(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ vendorId: vendorFollowups.vendorId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(vendorFollowups)
    .where(eq(vendorFollowups.status, "open"))
    .groupBy(vendorFollowups.vendorId);
  return new Map(rows.map((r) => [r.vendorId, r.n]));
}

async function loadFollowups(db: Db, where?: ReturnType<typeof and>): Promise<Followup[]> {
  const assignee = alias(users, "assignee");
  const creator = alias(users, "creator");
  const rows = await db
    .select({ f: vendorFollowups, vendorName: vendors.firmName, assignedName: assignee.name, createdByName: creator.name })
    .from(vendorFollowups)
    .innerJoin(vendors, eq(vendors.id, vendorFollowups.vendorId))
    .leftJoin(assignee, eq(assignee.id, vendorFollowups.assignedTo))
    .leftJoin(creator, eq(creator.id, vendorFollowups.createdBy))
    .where(where)
    .orderBy(asc(vendorFollowups.status), sql`${vendorFollowups.dueDate} asc nulls last`, desc(vendorFollowups.createdAt));
  return rows.map(({ f, vendorName, assignedName, createdByName }) => ({
    id: f.id,
    vendorId: f.vendorId,
    vendorName,
    reason: f.reason,
    notes: f.notes,
    dueDate: f.dueDate,
    assignedTo: f.assignedTo,
    assignedName,
    status: f.status,
    outcome: f.outcome,
    createdByName,
    createdAt: f.createdAt.toISOString(),
    doneAt: f.doneAt?.toISOString() ?? null,
  }));
}

vendorRoutes.get("/vendors", view, async (c) => {
  const db = await getDb();
  const [rows, ledger, followups] = await Promise.all([
    db.select().from(vendors).orderBy(desc(vendors.isActive), asc(vendors.isWalkIn), asc(vendors.firmName)),
    loadLedger(db),
    openFollowupCounts(db),
  ]);
  const today = todayIST();
  const byVendor = new Map<string, typeof ledger>();
  for (const o of ledger) byVendor.set(o.vendorId, [...(byVendor.get(o.vendorId) ?? []), o]);
  return c.json(rows.map((v) => listItem(v, vendorStats(byVendor.get(v.id) ?? [], today), followups.get(v.id) ?? 0)));
});

/** Short list for pickers (order form, finance). Anyone who can create orders needs it. */
vendorRoutes.get("/vendor-options", async (c) => {
  const db = await getDb();
  const rows = await db
    .select({ id: vendors.id, code: vendors.code, firmName: vendors.firmName, isWalkIn: vendors.isWalkIn, pricingModel: vendors.pricingModel })
    .from(vendors)
    .where(eq(vendors.isActive, true))
    .orderBy(desc(vendors.isWalkIn), asc(vendors.firmName));
  return c.json(rows);
});

vendorRoutes.post("/gst/lookup", view, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { gstin?: unknown };
  if (typeof body.gstin !== "string") fail(400, "Send { gstin }");
  return c.json(await lookupGstin(body.gstin));
});

// Prices and discounts belong to Catalogue & prices: admins with edit access there.
function onlyAdminsSetPrices(user: AuthedUser, input: { rates?: unknown; discountPercent?: number }, existing?: Vendor) {
  if (settingsAccess(user) === "edit") return;
  const ratesChanged = input.rates !== undefined && JSON.stringify(input.rates) !== JSON.stringify(existing?.rates ?? {});
  const discountChanged = input.discountPercent !== undefined && input.discountPercent !== (existing?.discountPercent ?? 0);
  if (ratesChanged || discountChanged) fail(403, "Only admins with edit access to Catalogue & prices can change a vendor's prices or discount");
}

vendorRoutes.post("/vendors", edit, async (c) => {
  const me = c.get("user");
  const input = await readBody(c, vendorSchema);
  onlyAdminsSetPrices(me, { rates: input.rates && Object.keys(input.rates).length ? input.rates : undefined, discountPercent: input.discountPercent || undefined });
  const db = await getDb();
  const dupe = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(sql`lower(${vendors.firmName}) = ${input.firmName.toLowerCase()}`)
    .limit(1);
  if (dupe.length) fail(409, "A vendor with this name already exists", { field: "firmName" });
  const [row] = await db
    .insert(vendors)
    .values({ ...input, gstin: input.gstin?.toUpperCase() ?? null, rates: input.rates ?? {}, code: await nextVendorCode(db), createdBy: me.id, isActive: input.isActive ?? true })
    .returning();
  return c.json(row, 201);
});

vendorRoutes.get("/vendors/:id", view, async (c) => {
  const id = idParam(c);
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!v) fail(404, "Vendor not found");

  const ledger = await loadLedger(db, { vendorIds: [id] });
  const stats = vendorStats(ledger);

  // Purchases and payments by month, last 12 months.
  const thisMonth = todayIST().slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, i - 11));
  const monthly = months.map((month) => {
    const inMonth = ledger.filter((o) => o.orderDate.startsWith(month));
    const paidInMonth = ledger.flatMap((o) => o.paymentDays).filter((p) => p.day.startsWith(month));
    return {
      month,
      orders: inMonth.length,
      value: Math.round(inMonth.reduce((s, o) => s + o.total, 0)),
      paid: Math.round(paidInMonth.reduce((s, p) => s + p.amount, 0)),
    };
  });

  const recentOrders: OrderListItem[] = (await listOrders(db, { vendorId: id })).slice(0, 25);
  const followups = await loadFollowups(db, and(eq(vendorFollowups.vendorId, id)));

  const detail: VendorDetail = {
    ...listItem(v, stats, 0),
    legalName: v.legalName,
    tradeName: v.tradeName,
    address: v.address,
    city: v.city,
    pincode: v.pincode,
    gstStatus: v.gstStatus,
    businessType: v.businessType,
    taxpayerType: v.taxpayerType,
    gstRegisteredOn: v.gstRegisteredOn,
    gstCheckedAt: v.gstCheckedAt?.toISOString() ?? null,
    branches: v.branches,
    rates: v.rates,
    discountPercent: v.discountPercent,
    deliveryTerms: v.deliveryTerms,
    paymentDays: v.paymentDays,
    paymentNote: v.paymentNote,
    contact1Email: v.contact1Email,
    contact2Name: v.contact2Name,
    contact2Phone: v.contact2Phone,
    contact2Email: v.contact2Email,
    remarks: v.remarks,
    createdAt: v.createdAt.toISOString(),
    stats,
    monthly,
    recentOrders,
    followups,
  };
  return c.json(detail);
});

vendorRoutes.patch("/vendors/:id", edit, async (c) => {
  const me = c.get("user");
  const id = idParam(c);
  const input = await readBody(c, vendorSchema.partial());
  const db = await getDb();
  const [existing] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!existing) fail(404, "Vendor not found");
  onlyAdminsSetPrices(me, input, existing);
  if (input.firmName && input.firmName.toLowerCase() !== existing.firmName.toLowerCase()) {
    const dupe = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(sql`lower(${vendors.firmName}) = ${input.firmName.toLowerCase()}`)
      .limit(1);
    if (dupe.length) fail(409, "A vendor with this name already exists", { field: "firmName" });
  }
  const [row] = await db
    .update(vendors)
    .set({ ...input, ...(input.gstin !== undefined ? { gstin: input.gstin?.toUpperCase() ?? null } : {}), updatedAt: new Date() })
    .where(eq(vendors.id, id))
    .returning();
  return c.json(row);
});

// ---------- Follow-ups (vendor communication) ----------

vendorRoutes.get("/followups", view, async (c) => {
  const status = c.req.query("status");
  const db = await getDb();
  return c.json(await loadFollowups(db, status === "open" || status === "done" ? and(eq(vendorFollowups.status, status)) : undefined));
});

vendorRoutes.post("/vendors/:id/followups", edit, async (c) => {
  const vendorId = idParam(c);
  const input = await readBody(c, followupSchema);
  const db = await getDb();
  const [v] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!v) fail(404, "Vendor not found");
  const [row] = await db
    .insert(vendorFollowups)
    .values({ vendorId, reason: input.reason, notes: input.notes ?? null, dueDate: input.dueDate ?? null, assignedTo: input.assignedTo ?? null, createdBy: c.get("user").id })
    .returning();
  return c.json(row, 201);
});

vendorRoutes.patch("/followups/:id", edit, async (c) => {
  const id = idParam(c);
  const input = await readBody(c, followupUpdateSchema);
  const db = await getDb();
  const me = c.get("user");
  const [row] = await db
    .update(vendorFollowups)
    .set({
      ...input,
      ...(input.status === "done" ? { doneAt: new Date(), doneBy: me.id } : input.status === "open" ? { doneAt: null, doneBy: null } : {}),
    })
    .where(eq(vendorFollowups.id, id))
    .returning();
  if (!row) fail(404, "Follow-up not found");
  return c.json(row);
});

/** People a follow-up can be assigned to. */
vendorRoutes.get("/assignees", view, async (c) => {
  const db = await getDb();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name));
  return c.json(rows);
});
