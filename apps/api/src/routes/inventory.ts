import { Hono, type Context } from "hono";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, inventoryItems, inventoryVariants, orders, purchases, stockMovements, suppliers, users, type Db } from "@vawe/db";
import {
  canView,
  checkGstin,
  INVENTORY_CATEGORIES,
  inventoryItemSchema,
  movementSchema,
  supplierSchema,
  variantSchema,
  variantUpdateSchema,
  type InventoryItemView,
  type InventoryUsage,
  type MovementView,
  type SupplierView,
} from "@vawe/shared";
import { addDays, monthBounds, shiftMonth, todayIST } from "../lib/dates";
import { fail, idParam, readBody } from "../lib/http";
import { requireAccess } from "../middleware/auth";
import type { AppEnv } from "../types";

// Inventory: everyone signed in can view it; only admins change items, colours or stock (a fixed rule,
// not something ops can grant). Stock only ever changes through a movement.
export const inventoryRoutes = new Hono<AppEnv>();
// Changing items, colours or stock: an admin with Inventory: edit.
const editStock = requireAccess("inventory", "edit");

const r2 = (n: number) => Math.round(n * 100) / 100;

inventoryRoutes.get("/inventory", async (c) => {
  const db = await getDb();
  const since = addDays(todayIST(), -30);
  const [items, variants, used] = await Promise.all([
    db.select().from(inventoryItems).orderBy(asc(inventoryItems.sort), asc(inventoryItems.name)),
    db.select().from(inventoryVariants).orderBy(asc(inventoryVariants.colour)),
    db
      .select({ variantId: stockMovements.variantId, used: sql<number>`sum(-${stockMovements.quantity})`.mapWith(Number) })
      .from(stockMovements)
      .where(and(eq(stockMovements.kind, "out"), gte(stockMovements.movedOn, since)))
      .groupBy(stockMovements.variantId),
  ]);
  const usedMap = new Map(used.map((u) => [u.variantId, u.used]));
  const list: InventoryItemView[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    colourCount: i.colourCount,
    notes: i.notes,
    isActive: i.isActive,
    variants: variants
      .filter((v) => v.itemId === i.id)
      .map((v) => {
        const usedLast30 = r2(usedMap.get(v.id) ?? 0);
        const perDay = usedLast30 / 30;
        return {
          id: v.id,
          colour: v.colour,
          stock: v.stock,
          reorderLevel: v.reorderLevel,
          unitCost: v.unitCost,
          isActive: v.isActive,
          usedLast30,
          daysLeft: perDay > 0 ? Math.floor(v.stock / perDay) : null,
          low: v.isActive && v.reorderLevel > 0 && v.stock <= v.reorderLevel,
        };
      }),
  }));
  return c.json(list);
});

/** Stock used per month (stock-outs), last `months` months including this one. */
inventoryRoutes.get("/inventory/usage", async (c) => {
  const count = Math.min(Math.max(Number(c.req.query("months")) || 4, 2), 12);
  const thisMonth = todayIST().slice(0, 7);
  const months = Array.from({ length: count }, (_, i) => shiftMonth(thisMonth, i - (count - 1)));
  const db = await getDb();
  const rows = await db
    .select({
      itemId: inventoryItems.id,
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      category: inventoryItems.category,
      month: sql<string>`to_char(${stockMovements.movedOn}, 'YYYY-MM')`,
      used: sql<number>`sum(-${stockMovements.quantity})`.mapWith(Number),
    })
    .from(stockMovements)
    .innerJoin(inventoryVariants, eq(inventoryVariants.id, stockMovements.variantId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryVariants.itemId))
    .where(and(eq(stockMovements.kind, "out"), gte(stockMovements.movedOn, monthBounds(months[0]!).from)))
    .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit, inventoryItems.category, sql`to_char(${stockMovements.movedOn}, 'YYYY-MM')`);

  const items = new Map<string, InventoryUsage["topItems"][number] & { category: string }>();
  for (const r of rows) {
    const entry = items.get(r.itemId) ?? { itemId: r.itemId, name: r.name, unit: r.unit, category: r.category, values: months.map(() => 0) };
    const idx = months.indexOf(r.month);
    if (idx >= 0) entry.values[idx] = r2(entry.values[idx]! + r.used);
    items.set(r.itemId, entry);
  }
  // Category totals mix units (bars, pieces…), so they're only a rough guide; per-item figures are exact.
  const byCategory = INVENTORY_CATEGORIES.map((category) => ({
    category,
    values: months.map((_, i) => r2([...items.values()].filter((it) => it.category === category).reduce((s, it) => s + it.values[i]!, 0))),
  }));
  const usage: InventoryUsage = {
    months,
    byCategory,
    topItems: [...items.values()]
      .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0))
      .slice(0, 12)
      .map(({ itemId, name, unit, values }) => ({ itemId, name, unit, values })),
  };
  return c.json(usage);
});

inventoryRoutes.get("/inventory/movements", async (c) => {
  const q = c.req.query();
  const db = await getDb();
  const conds = [];
  if (q.variantId && /^[0-9a-f-]{36}$/i.test(q.variantId)) conds.push(eq(stockMovements.variantId, q.variantId));
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) conds.push(gte(stockMovements.movedOn, q.from));
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) conds.push(lte(stockMovements.movedOn, q.to));
  const rows = await db
    .select({
      m: stockMovements,
      itemName: inventoryItems.name,
      colour: inventoryVariants.colour,
      unit: inventoryItems.unit,
      orderCode: orders.code,
      userName: users.name,
    })
    .from(stockMovements)
    .innerJoin(inventoryVariants, eq(inventoryVariants.id, stockMovements.variantId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryVariants.itemId))
    .leftJoin(orders, eq(orders.id, stockMovements.orderId))
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(stockMovements.createdAt))
    .limit(300);
  const list: MovementView[] = rows.map(({ m, itemName, colour, unit, orderCode, userName }) => ({
    id: m.id,
    variantId: m.variantId,
    itemName,
    colour,
    unit,
    kind: m.kind,
    quantity: m.quantity,
    balanceAfter: m.balanceAfter,
    reason: m.reason,
    orderCode,
    userName,
    movedOn: m.movedOn,
    createdAt: m.createdAt.toISOString(),
  }));
  return c.json(list);
});

// ---------- Raw material suppliers ----------

inventoryRoutes.get("/inventory/suppliers", async (c) => {
  const db = await getDb();
  const rows = await db
    .select({
      s: suppliers,
      purchases: sql<number>`count(${purchases.id})`.mapWith(Number),
      spent: sql<number>`coalesce(sum(${purchases.amount}), 0)`.mapWith(Number),
      lastPurchase: sql<string | null>`max(${purchases.purchasedOn})::text`,
    })
    .from(suppliers)
    .leftJoin(purchases, eq(purchases.supplierId, suppliers.id))
    .groupBy(suppliers.id)
    .orderBy(asc(suppliers.name));
  // What was spent is finance data: only for people who can see Finance.
  const showSpent = canView(c.get("user"), "finance");
  const list: SupplierView[] = rows.map(({ s, purchases, spent, lastPurchase }) => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName,
    phone: s.phone,
    gstin: s.gstin,
    supplies: s.supplies,
    notes: s.notes,
    isActive: s.isActive,
    purchases,
    spent: showSpent ? spent : null,
    lastPurchase,
  }));
  return c.json(list);
});

async function supplierInput(c: Context<AppEnv>, partial: boolean) {
  const input = await readBody(c, partial ? supplierSchema.partial() : supplierSchema);
  if (input.gstin) {
    const check = checkGstin(input.gstin);
    if (!check.valid) fail(400, check.reason, { field: "gstin" });
    input.gstin = check.gstin;
  }
  return input;
}

async function nameTaken(db: Db, name: string, exceptId?: string) {
  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where(sql`lower(${suppliers.name}) = lower(${name})`).limit(1);
  return !!row && row.id !== exceptId;
}

inventoryRoutes.post("/inventory/suppliers", editStock, async (c) => {
  const input = await supplierInput(c, false);
  const db = await getDb();
  if (await nameTaken(db, input.name!)) fail(409, "A supplier with this name already exists", { field: "name" });
  const [row] = await db.insert(suppliers).values({ ...input, name: input.name! }).returning();
  return c.json(row, 201);
});

inventoryRoutes.patch("/inventory/suppliers/:id", editStock, async (c) => {
  const id = idParam(c);
  const input = await supplierInput(c, true);
  const db = await getDb();
  if (input.name && (await nameTaken(db, input.name, id))) fail(409, "A supplier with this name already exists", { field: "name" });
  const [row] = await db.update(suppliers).set(input).where(eq(suppliers.id, id)).returning();
  if (!row) fail(404, "Supplier not found");
  return c.json(row);
});

// ---------- Admin: items, colours, stock ----------

inventoryRoutes.post("/inventory/items", editStock, async (c) => {
  const input = await readBody(c, inventoryItemSchema);
  const db = await getDb();
  const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${inventoryItems.sort}), 0)`.mapWith(Number) }).from(inventoryItems);
  const [item] = await db
    .insert(inventoryItems)
    .values({ name: input.name, category: input.category, unit: input.unit, colourCount: input.colourCount ?? null, notes: input.notes ?? null, sort: max + 1 })
    .returning();
  // Items without colours need one stock line straight away.
  if (!input.colourCount) await db.insert(inventoryVariants).values({ itemId: item!.id, colour: "Standard" });
  return c.json(item, 201);
});

inventoryRoutes.patch("/inventory/items/:id", editStock, async (c) => {
  const input = await readBody(c, inventoryItemSchema.partial());
  const db = await getDb();
  const [row] = await db.update(inventoryItems).set(input).where(eq(inventoryItems.id, idParam(c))).returning();
  if (!row) fail(404, "Item not found");
  return c.json(row);
});

async function move(db: Db, args: { variantId: string; delta: number; kind: "in" | "out" | "adjust"; reason: string | null; orderId?: string | null; purchaseId?: string | null; movedOn: string; userId: string }) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    // Lock the stock line so two people moving stock at once can't lose an update.
    const [v] = await t.select().from(inventoryVariants).where(eq(inventoryVariants.id, args.variantId)).for("update");
    if (!v) fail(404, "Stock line not found");
    const balance = r2(v.stock + args.delta);
    if (balance < 0) fail(400, `Only ${v.stock} in stock; you can't take out more than that`, { field: "quantity" });
    await t.update(inventoryVariants).set({ stock: balance }).where(eq(inventoryVariants.id, v.id));
    const [m] = await t
      .insert(stockMovements)
      .values({ variantId: v.id, kind: args.kind, quantity: r2(args.delta), balanceAfter: balance, reason: args.reason, orderId: args.orderId ?? null, purchaseId: args.purchaseId ?? null, userId: args.userId, movedOn: args.movedOn })
      .returning();
    return m!;
  });
}

inventoryRoutes.post("/inventory/items/:id/variants", editStock, async (c) => {
  const itemId = idParam(c);
  const input = await readBody(c, variantSchema);
  const db = await getDb();
  const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  if (!item) fail(404, "Item not found");
  const existing = await db.select({ colour: inventoryVariants.colour }).from(inventoryVariants).where(eq(inventoryVariants.itemId, itemId));
  if (existing.some((e) => e.colour.toLowerCase() === input.colour.toLowerCase())) fail(409, "That colour is already listed", { field: "colour" });
  const [variant] = await db
    .insert(inventoryVariants)
    .values({ itemId, colour: input.colour, reorderLevel: input.reorderLevel, unitCost: input.unitCost ?? null })
    .returning();
  if (input.openingStock > 0) {
    await move(db, { variantId: variant!.id, delta: input.openingStock, kind: "in", reason: "Opening stock", movedOn: todayIST(), userId: c.get("user").id });
  }
  return c.json(variant, 201);
});

inventoryRoutes.patch("/inventory/variants/:id", editStock, async (c) => {
  const input = await readBody(c, variantUpdateSchema);
  const db = await getDb();
  const [row] = await db.update(inventoryVariants).set(input).where(eq(inventoryVariants.id, idParam(c))).returning();
  if (!row) fail(404, "Stock line not found");
  return c.json(row);
});

inventoryRoutes.post("/inventory/movements", editStock, async (c) => {
  const input = await readBody(c, movementSchema);
  const db = await getDb();
  const userId = c.get("user").id;
  if (input.movedOn > addDays(todayIST(), 1)) fail(400, "The date is in the future", { field: "movedOn" });

  if (input.kind === "in") {
    if (input.purchaseId) {
      const [p] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.id, input.purchaseId)).limit(1);
      if (!p) fail(400, "Purchase not found", { field: "purchaseId" });
    }
    return c.json(await move(db, { variantId: input.variantId, delta: input.quantity, kind: "in", reason: input.reason ?? null, purchaseId: input.purchaseId, movedOn: input.movedOn, userId }), 201);
  }
  if (input.kind === "out") {
    if (input.orderId) {
      const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o) fail(400, "Order not found", { field: "orderId" });
    }
    return c.json(await move(db, { variantId: input.variantId, delta: -input.quantity, kind: "out", reason: input.reason ?? null, orderId: input.orderId, movedOn: input.movedOn, userId }), 201);
  }
  // Adjustment: a recount sets the stock to what was counted.
  const [v] = await db.select({ stock: inventoryVariants.stock }).from(inventoryVariants).where(eq(inventoryVariants.id, input.variantId)).limit(1);
  if (!v) fail(404, "Stock line not found");
  const delta = r2(input.countedStock - v.stock);
  if (delta === 0) fail(400, "The count matches the current stock: nothing to adjust", { field: "countedStock" });
  return c.json(await move(db, { variantId: input.variantId, delta, kind: "adjust", reason: input.reason, movedOn: input.movedOn, userId }), 201);
});
