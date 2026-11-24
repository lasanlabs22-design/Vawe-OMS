import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  CATALOG_KINDS,
  EXPENSE_CATEGORIES,
  FOLLOWUP_STATUSES,
  GLASS_GROUPS,
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  MOVEMENT_KINDS,
  ORDER_FAMILIES,
  ORDER_SOURCES,
  ORDER_STAGES,
  PAYMENT_METHODS,
  PAYMENT_TERMS,
  PRICING_MODELS,
  type Estimate,
  type Rates,
} from "@vawe/shared";
import { users } from "./schema";

// Business data for the five modules. Money is numeric(12,2) read as JS numbers (rupees); dates that
// are calendar days (order date, paid on…) are `date` strings "YYYY-MM-DD" in India time.

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const day = (name: string) => date(name, { mode: "string" });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: "set null" });

export const catalogKind = pgEnum("catalog_kind", CATALOG_KINDS);
export const orderFamily = pgEnum("order_family", ORDER_FAMILIES);
export const glassGroup = pgEnum("glass_group", GLASS_GROUPS);
export const pricingModel = pgEnum("pricing_model", PRICING_MODELS);
export const paymentTerms = pgEnum("payment_terms", PAYMENT_TERMS);
export const followupStatus = pgEnum("followup_status", FOLLOWUP_STATUSES);
export const orderStage = pgEnum("order_stage", ORDER_STAGES);
export const orderSource = pgEnum("order_source", ORDER_SOURCES);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const expenseCategory = pgEnum("expense_category", EXPENSE_CATEGORIES);
export const inventoryCategory = pgEnum("inventory_category", INVENTORY_CATEGORIES);
export const inventoryUnit = pgEnum("inventory_unit", INVENTORY_UNITS);
export const movementKind = pgEnum("movement_kind", MOVEMENT_KINDS);

// ---------- Settings & counters ----------

// Small named settings: the default price list, company details for documents.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: userRef("updated_by"),
  updatedAt: updatedAt(),
});

// Running numbers for human-friendly codes (VND-0001, VW-2611-0001). Incremented atomically.
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

// ---------- Catalogue (the workbook's Mapping sheet) ----------

export const catalogOptions = pgTable(
  "catalog_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: catalogKind("kind").notNull(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    // order types: how they're priced and drawn
    family: orderFamily("family"),
    // glass types: which rate applies
    glassGroup: glassGroup("glass_group"),
    // handle types belong to one order type (the workbook's dependent dropdown)
    orderTypeId: uuid("order_type_id").references((): any => catalogOptions.id, { onDelete: "cascade" }),
  },
  (t) => [index("catalog_kind_idx").on(t.kind, t.sort)],
);

// ---------- Vendors ----------

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    firmName: text("firm_name").notNull(),
    isWalkIn: boolean("is_walk_in").notNull().default(false),
    gstin: text("gstin"),
    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    address: text("address"),
    state: text("state"),
    gstStatus: text("gst_status"),
    gstCheckedAt: timestamp("gst_checked_at", { withTimezone: true }),
    branches: integer("branches").notNull().default(1),
    pricingModel: pricingModel("pricing_model").notNull().default("rft"),
    rates: jsonb("rates").$type<Rates>().notNull().default({}),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    deliveryTerms: text("delivery_terms"),
    paymentTerms: paymentTerms("payment_terms").notNull().default("before_delivery"),
    paymentDays: integer("payment_days"),
    paymentNote: text("payment_note"),
    contact1Name: text("contact1_name"),
    contact1Phone: text("contact1_phone"),
    contact1Email: text("contact1_email"),
    contact2Name: text("contact2_name"),
    contact2Phone: text("contact2_phone"),
    contact2Email: text("contact2_email"),
    remarks: text("remarks"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vendors_code_idx").on(t.code), index("vendors_name_idx").on(t.firmName)],
);

export const vendorFollowups = pgTable(
  "vendor_followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    notes: text("notes"),
    dueDate: day("due_date"),
    assignedTo: userRef("assigned_to"),
    status: followupStatus("status").notNull().default("open"),
    outcome: text("outcome"),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: userRef("done_by"),
  },
  (t) => [index("followups_vendor_idx").on(t.vendorId), index("followups_status_idx").on(t.status, t.dueDate)],
);

// ---------- Orders ----------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    projectName: text("project_name"),
    location: text("location"),
    pmName: text("pm_name"),
    pmPhone: text("pm_phone"),
    source: orderSource("source").notNull(),
    sourceDetail: text("source_detail"),
    orderDate: day("order_date").notNull(),
    expectedDelivery: day("expected_delivery"),
    stage: orderStage("stage").notNull().default("design"),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    // On hold for procurement: materials aren't here yet. The stage doesn't change while held.
    onHold: boolean("on_hold").notNull().default(false),
    holdReason: text("hold_reason"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    // The estimate (ex-GST subtotal, discount, GST, total) and how it was worked out.
    subtotal: money("subtotal").notNull().default(0),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    discountAmount: money("discount_amount").notNull().default(0),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2, mode: "number" }).notNull().default(18),
    gstAmount: money("gst_amount").notNull().default(0),
    total: money("total").notNull().default(0),
    pricing: jsonb("pricing").$type<Estimate>(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // When payment is due: set on delivery from the vendor's payment terms.
    dueDate: day("due_date"),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_code_idx").on(t.code),
    index("orders_vendor_idx").on(t.vendorId),
    index("orders_date_idx").on(t.orderDate),
    index("orders_stage_idx").on(t.stage),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    // Names are stored as text (not ids) so old orders keep reading right if the catalogue changes.
    orderType: text("order_type").notNull(),
    family: orderFamily("family").notNull(),
    frameType: text("frame_type").notNull(),
    frameColour: text("frame_colour").notNull(),
    glassType: text("glass_type").notNull(),
    glassGroup: glassGroup("glass_group").notNull(),
    widthMm: integer("width_mm").notNull(),
    heightMm: integer("height_mm").notNull(),
    handlePosition: text("handle_position").notNull(),
    handleType: text("handle_type").notNull(),
    // From the same colour list as the frame; starts as the frame colour.
    handleColour: text("handle_colour").notNull(),
    divider: text("divider").notNull(),
    hingeHoles: integer("hinge_holes").notNull(),
    quantity: integer("quantity").notNull(),
    sqft: qty("sqft").notNull().default(0),
    amount: money("amount").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// The order's history: every stage move, hold, release, edit and cancellation, with who and when.
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // created | stage | hold | release | edited | cancelled | payment | return
    fromStage: orderStage("from_stage"),
    toStage: orderStage("to_stage"),
    note: text("note"),
    userId: userRef("user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

// ---------- Finance ----------

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    paidOn: day("paid_on").notNull(),
    note: text("note"),
    recordedBy: userRef("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_order_idx").on(t.orderId), index("payments_vendor_idx").on(t.vendorId), index("payments_date_idx").on(t.paidOn)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: expenseCategory("category").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    spentOn: day("spent_on").notNull(),
    description: text("description"),
    recordedBy: userRef("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_date_idx").on(t.spentOn), index("expenses_order_idx").on(t.orderId)],
);

export const orderReturns = pgTable(
  "order_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    // Credit given against the order: lowers what the vendor owes.
    amount: money("amount").notNull(),
    items: text("items"),
    reason: text("reason").notNull(),
    returnedOn: day("returned_on").notNull(),
    recordedBy: userRef("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("returns_order_idx").on(t.orderId), index("returns_date_idx").on(t.returnedOn)],
);

// Raw material suppliers (who Vawe buys from). Not vendors: vendors are the B2B buyers.
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    gstin: text("gstin"),
    // What they supply, in words ("45mm and 20mm profiles", "clear and fluted glass").
    supplies: text("supplies"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppliers_name_idx").on(sql`lower(${t.name})`)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    // Kept as written on the purchase, so it still reads right if the supplier is renamed.
    supplierName: text("supplier_name").notNull(),
    invoiceNo: text("invoice_no"),
    purchasedOn: day("purchased_on").notNull(),
    amount: money("amount").notNull(),
    description: text("description"),
    recordedBy: userRef("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("purchases_date_idx").on(t.purchasedOn), index("purchases_supplier_idx").on(t.supplierId)],
);

// ---------- Inventory ----------

// What Vawe stocks (the client's IMS list): e.g. "45mm frame", available in up to 9 colours.
export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: inventoryCategory("category").notNull(),
  unit: inventoryUnit("unit").notNull(),
  // How many colours the client said it comes in (a reminder until every colour is added).
  colourCount: integer("colour_count"),
  notes: text("notes"),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// One stock line per item and colour ("Standard" when an item has no colours).
export const inventoryVariants = pgTable(
  "inventory_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    colour: text("colour").notNull(),
    stock: qty("stock").notNull().default(0),
    reorderLevel: qty("reorder_level").notNull().default(0),
    unitCost: money("unit_cost"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("variants_item_colour_idx").on(t.itemId, t.colour)],
);

// Every stock change. Stock is never edited directly: the balance is the sum of these.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => inventoryVariants.id, { onDelete: "cascade" }),
    kind: movementKind("kind").notNull(),
    // Signed: + adds stock, − removes it.
    quantity: qty("quantity").notNull(),
    balanceAfter: qty("balance_after").notNull(),
    reason: text("reason"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    userId: userRef("user_id"),
    movedOn: day("moved_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("movements_variant_idx").on(t.variantId, t.createdAt), index("movements_date_idx").on(t.movedOn)],
);

export type Vendor = typeof vendors.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type CatalogOption = typeof catalogOptions.$inferSelect;
