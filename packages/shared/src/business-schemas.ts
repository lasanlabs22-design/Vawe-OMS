import { z } from "zod";
import {
  CATALOG_KINDS,
  EXPENSE_CATEGORIES,
  GLASS_GROUPS,
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  ORDER_FAMILIES,
  ORDER_SOURCES,
  ORDER_STAGES,
  PAYMENT_METHODS,
  PAYMENT_TERMS,
  PRICING_MODELS,
  type Rates,
} from "./domain";

// Input validation shared by the API (which enforces it) and the forms (which pre-check it).

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const required = (label: string, max = 160) => z.string().trim().min(1, `Enter ${label}`).max(max);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalDay = z.union([isoDay, z.literal("").transform(() => null), z.null()]).optional();
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"));
const optionalPhone = z.union([phone, z.literal("").transform(() => null), z.null()]).optional();
const optionalEmail = z.union([z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), z.literal("").transform(() => null), z.null()]).optional();
const money = (label: string) => z.coerce.number({ message: `Enter ${label}` }).finite().min(0, `${label} can't be negative`).max(1e10);
const positiveMoney = (label: string) => z.coerce.number({ message: `Enter ${label}` }).finite().positive(`Enter ${label}`).max(1e10);

const rateValue = z.union([z.coerce.number().finite().min(0).max(1e6), z.literal("").transform(() => undefined), z.null().transform(() => undefined)]).optional();
export const ratesSchema = z
  .object({
    sqftRegular: rateValue,
    sqftFluted: rateValue,
    rftProfile: rateValue,
    rftGlassRegular: rateValue,
    rftGlassFluted: rateValue,
    ftcLacquered: rateValue,
    ftcDigitalPrint: rateValue,
    ftcLaminateInsertion: rateValue,
    ftcCane: rateValue,
    ftcLaminateGlass: rateValue,
    makingCharge: rateValue,
  })
  .transform((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as Rates);

// ---------- Catalogue & settings ----------

export const catalogCreateSchema = z.object({
  kind: z.enum(CATALOG_KINDS),
  name: required("a name", 80),
  family: z.enum(ORDER_FAMILIES).optional(),
  glassGroup: z.enum(GLASS_GROUPS).optional(),
  orderTypeId: z.uuid().optional(),
});

export const catalogUpdateSchema = z.object({
  name: required("a name", 80).optional(),
  isActive: z.boolean().optional(),
  family: z.enum(ORDER_FAMILIES).optional(),
  glassGroup: z.enum(GLASS_GROUPS).optional(),
  sort: z.number().int().min(0).max(10000).optional(),
});

export const companySchema = z.object({
  name: required("the company name", 120),
  gstin: text(15),
  address: text(300),
  phone: text(40),
  email: text(120),
});
export type Company = z.infer<typeof companySchema>;

// ---------- Vendors ----------

export const vendorSchema = z.object({
  firmName: required("the firm name"),
  gstin: text(15),
  legalName: text(200),
  tradeName: text(200),
  address: text(400),
  state: text(60),
  gstStatus: text(40),
  branches: z.coerce.number().int().min(1).max(500).default(1),
  pricingModel: z.enum(PRICING_MODELS),
  rates: ratesSchema.optional(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  deliveryTerms: text(120),
  paymentTerms: z.enum(PAYMENT_TERMS),
  paymentDays: z.union([z.coerce.number().int().min(0).max(365), z.literal("").transform(() => null), z.null()]).optional(),
  paymentNote: text(300),
  contact1Name: text(120),
  contact1Phone: optionalPhone,
  contact1Email: optionalEmail,
  contact2Name: text(120),
  contact2Phone: optionalPhone,
  contact2Email: optionalEmail,
  remarks: text(1000),
  isActive: z.boolean().optional(),
});
export type VendorInput = z.input<typeof vendorSchema>;

export const followupSchema = z.object({
  reason: required("what to talk about", 300),
  notes: text(1000),
  dueDate: optionalDay,
  assignedTo: z.union([z.uuid(), z.literal("").transform(() => null), z.null()]).optional(),
});

export const followupUpdateSchema = z.object({
  status: z.enum(["open", "done"]).optional(),
  outcome: text(1000),
  dueDate: optionalDay,
  assignedTo: z.union([z.uuid(), z.literal("").transform(() => null), z.null()]).optional(),
});

// ---------- Orders ----------

export const orderItemSchema = z.object({
  orderType: required("the order type", 80),
  frameType: required("the frame type", 80),
  frameColour: required("the frame colour", 80),
  glassType: required("the glass type", 80),
  widthMm: z.coerce.number({ message: "Enter the width" }).int("Width in whole mm").min(50, "Width looks too small").max(10000, "Width looks too big"),
  heightMm: z.coerce.number({ message: "Enter the height" }).int("Height in whole mm").min(50, "Height looks too small").max(10000, "Height looks too big"),
  handlePosition: required("the handle position", 80),
  handleType: required("the handle type", 80),
  handleColour: required("the handle colour", 80),
  divider: required("the divider", 80),
  hingeHoles: z.coerce.number().int().min(2, "2 to 5 hinge holes").max(5, "2 to 5 hinge holes"),
  quantity: z.coerce.number({ message: "Enter the number of shutters" }).int().min(1, "At least 1 shutter").max(500),
});
export type OrderItemInput = z.input<typeof orderItemSchema>;

export const orderSchema = z.object({
  vendorId: z.uuid("Choose a vendor"),
  customerName: text(160),
  customerPhone: optionalPhone,
  projectName: text(160),
  location: text(200),
  pmName: text(120),
  pmPhone: optionalPhone,
  source: z.enum(ORDER_SOURCES, { message: "Choose where the order came from" }),
  sourceDetail: text(60),
  orderDate: isoDay,
  expectedDelivery: optionalDay,
  notes: text(2000),
  items: z.array(orderItemSchema).min(1, "Add at least one item").max(100, "At most 100 items per order"),
});
export type OrderInput = z.input<typeof orderSchema>;

export const estimatePreviewSchema = z.object({
  vendorId: z.uuid(),
  items: z.array(orderItemSchema.partial()).max(100),
});

export const stageChangeSchema = z.object({ stage: z.enum(ORDER_STAGES), note: text(500) });
export const holdSchema = z.object({ reason: required("what's missing", 500) });
export const noteSchema = z.object({ note: text(500) });
export const cancelSchema = z.object({ reason: required("why it's cancelled", 500) });

// ---------- Finance ----------

export const paymentSchema = z.object({
  orderId: z.uuid("Choose the order"),
  amount: positiveMoney("the amount"),
  method: z.enum(PAYMENT_METHODS),
  reference: text(120),
  paidOn: isoDay,
  note: text(500),
});

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  orderId: z.union([z.uuid(), z.literal("").transform(() => null), z.null()]).optional(),
  amount: positiveMoney("the amount"),
  spentOn: isoDay,
  description: text(500),
});

export const returnSchema = z.object({
  orderId: z.uuid("Choose the order"),
  amount: money("the credit amount"),
  items: text(500),
  reason: required("the reason", 500),
  returnedOn: isoDay,
});

export const supplierSchema = z.object({
  name: required("the supplier name"),
  contactName: text(120),
  phone: optionalPhone,
  gstin: text(15),
  supplies: text(300),
  notes: text(500),
  isActive: z.boolean().optional(),
});

export const purchaseSchema = z.object({
  supplierName: required("the supplier", 160),
  invoiceNo: text(60),
  purchasedOn: isoDay,
  amount: positiveMoney("the amount"),
  description: text(1000),
});

// ---------- Inventory ----------

export const inventoryItemSchema = z.object({
  name: required("the item name", 120),
  category: z.enum(INVENTORY_CATEGORIES),
  unit: z.enum(INVENTORY_UNITS),
  colourCount: z.union([z.coerce.number().int().min(1).max(50), z.literal("").transform(() => null), z.null()]).optional(),
  notes: text(500),
  isActive: z.boolean().optional(),
});

export const variantSchema = z.object({
  colour: required("the colour", 60),
  reorderLevel: money("the reorder level").default(0),
  unitCost: z.union([money("the unit cost"), z.literal("").transform(() => null), z.null()]).optional(),
  openingStock: money("the opening stock").default(0),
});

export const variantUpdateSchema = z.object({
  reorderLevel: money("the reorder level").optional(),
  unitCost: z.union([money("the unit cost"), z.literal("").transform(() => null), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const movementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("in"), variantId: z.uuid(), quantity: positiveMoney("the quantity"), reason: text(300), purchaseId: z.uuid().nullable().optional(), movedOn: isoDay }),
  z.object({ kind: z.literal("out"), variantId: z.uuid(), quantity: positiveMoney("the quantity"), reason: text(300), orderId: z.uuid().nullable().optional(), movedOn: isoDay }),
  z.object({ kind: z.literal("adjust"), variantId: z.uuid(), countedStock: money("the counted stock"), reason: required("the reason for the adjustment", 300), movedOn: isoDay }),
]);
