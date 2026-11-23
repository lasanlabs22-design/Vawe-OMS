// The OMS vocabulary: one list per concept, used by the database enums, the API and the UI alike.

// ---------- Catalogue (the workbook's Mapping sheet) ----------

export const CATALOG_KINDS = ["order_type", "frame_type", "frame_colour", "glass_type", "handle_position", "handle_type", "divider"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  order_type: "Order types",
  frame_type: "Frame types",
  frame_colour: "Frame colours",
  glass_type: "Glass types",
  handle_position: "Handle positions",
  handle_type: "Handle types",
  divider: "Dividers",
};

/** How an order type is priced and drawn. */
export const ORDER_FAMILIES = ["profile_shutter", "sliding"] as const;
export type OrderFamily = (typeof ORDER_FAMILIES)[number];

/** Which rate a glass type is priced at. */
export const GLASS_GROUPS = ["regular", "fluted", "lacquered", "digital_print", "laminate_insertion", "cane", "laminate_glass", "none"] as const;
export type GlassGroup = (typeof GLASS_GROUPS)[number];

export const GLASS_GROUP_LABELS: Record<GlassGroup, string> = {
  regular: "Regular (tinted, clear, frosted)",
  fluted: "Fluted / mirror",
  lacquered: "Lacquered",
  digital_print: "Digital print",
  laminate_insertion: "Laminate insertion",
  cane: "Cane",
  laminate_glass: "Laminate glass",
  none: "No glass",
};

export const HINGE_HOLE_OPTIONS = [2, 3, 4, 5] as const;

// ---------- Vendors ----------

export const PRICING_MODELS = ["sqft", "rft"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const PAYMENT_TERMS = ["advance", "before_delivery", "net_15", "net_30", "monthly", "custom"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_TERM_LABELS: Record<PaymentTerms, string> = {
  advance: "Advance",
  before_delivery: "Before delivery",
  net_15: "Every 15 days",
  net_30: "30 days",
  monthly: "Monthly (1st/2nd)",
  custom: "Custom",
};

/** When payment is expected, in words, for orders not yet delivered. */
export function paymentTermsText(terms: PaymentTerms, customDays?: number | null): string {
  switch (terms) {
    case "advance":
      return "Advance, before production";
    case "before_delivery":
      return "Before delivery";
    case "net_15":
      return "15 days after delivery";
    case "net_30":
      return "30 days after delivery";
    case "monthly":
      return "Monthly, after delivery";
    case "custom":
      return customDays != null ? `${customDays} days after delivery` : "Custom terms";
  }
}

/** Days after delivery that payment falls due, per term. `custom` uses the vendor's own number. */
export const PAYMENT_TERM_DAYS: Record<Exclude<PaymentTerms, "custom">, number> = {
  advance: 0,
  before_delivery: 0,
  net_15: 15,
  net_30: 30,
  monthly: 30,
};

/** A vendor's rates in rupees. Missing = not agreed for this vendor (the default price list applies). */
export interface Rates {
  sqftRegular?: number;
  sqftFluted?: number;
  rftProfile?: number;
  rftGlassRegular?: number;
  rftGlassFluted?: number;
  ftcLacquered?: number;
  ftcDigitalPrint?: number;
  ftcLaminateInsertion?: number;
  ftcCane?: number;
  ftcLaminateGlass?: number;
  makingCharge?: number;
}

export const RATE_FIELDS: { key: keyof Rates; label: string; unit: string; group: "SQFT" | "RFT" | "FTC / glass" | "Other" }[] = [
  { key: "sqftRegular", label: "Regular glass", unit: "₹/sq ft", group: "SQFT" },
  { key: "sqftFluted", label: "Fluted glass", unit: "₹/sq ft", group: "SQFT" },
  { key: "rftProfile", label: "Profile", unit: "₹/r ft", group: "RFT" },
  { key: "rftGlassRegular", label: "Regular glass", unit: "₹/sq ft", group: "RFT" },
  { key: "rftGlassFluted", label: "Fluted glass", unit: "₹/sq ft", group: "RFT" },
  { key: "ftcLacquered", label: "Lacquered", unit: "₹/sq ft", group: "FTC / glass" },
  { key: "ftcDigitalPrint", label: "Digital print", unit: "₹/sq ft", group: "FTC / glass" },
  { key: "ftcLaminateInsertion", label: "Laminate insertion", unit: "₹/sq ft", group: "FTC / glass" },
  { key: "ftcCane", label: "Cane glass", unit: "₹/sq ft", group: "FTC / glass" },
  { key: "ftcLaminateGlass", label: "Laminate glass", unit: "₹/sq ft", group: "FTC / glass" },
  { key: "makingCharge", label: "Making charge", unit: "₹/shutter", group: "Other" },
];

export const FOLLOWUP_STATUSES = ["open", "done"] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

// ---------- Orders ----------

export const ORDER_STAGES = [
  "design",
  "qa",
  "dwg_confirmation",
  "estimate_confirmation",
  "awaiting_payment",
  "cutting",
  "drilling",
  "hinge_holes",
  "glass_cutting",
  "assembly",
  "packaging",
  "dispatched",
  "delivered",
  "cancelled",
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const STAGE_LABELS: Record<OrderStage, string> = {
  design: "In design",
  qa: "In Q/A",
  dwg_confirmation: "Awaiting DWG confirmation",
  estimate_confirmation: "Awaiting estimation confirmation",
  awaiting_payment: "Awaiting payment / advance",
  cutting: "Cutting",
  drilling: "Drilling",
  hinge_holes: "Hinge holes",
  glass_cutting: "Glass cutting",
  assembly: "Assembly",
  packaging: "Packaging",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** The order a job normally moves through (cancelled sits outside it). */
export const STAGE_FLOW: OrderStage[] = ORDER_STAGES.filter((s) => s !== "cancelled");
export const PRODUCTION_STAGES: OrderStage[] = ["cutting", "drilling", "hinge_holes", "glass_cutting", "assembly", "packaging"];
export const PRE_PRODUCTION_STAGES: OrderStage[] = ["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"];

export function stagePhase(stage: OrderStage): "pre" | "production" | "done" | "cancelled" {
  if (stage === "cancelled") return "cancelled";
  if (PRODUCTION_STAGES.includes(stage)) return "production";
  if (PRE_PRODUCTION_STAGES.includes(stage)) return "pre";
  return "done";
}

export const ORDER_SOURCES = ["direct_walkin", "social_media", "b2b_vendor", "offline_marketing", "reference"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const SOURCE_LABELS: Record<OrderSource, string> = {
  direct_walkin: "Direct / walk-in",
  social_media: "Social media",
  b2b_vendor: "B2B vendor",
  offline_marketing: "Offline marketing",
  reference: "Reference",
};

/** The second level of the source, where there is one. */
export const SOURCE_DETAILS: Partial<Record<OrderSource, { value: string; label: string }[]>> = {
  social_media: [
    { value: "instagram_reel", label: "Instagram reel" },
    { value: "instagram_ad", label: "Instagram ad" },
    { value: "facebook_reel", label: "Facebook reel" },
    { value: "facebook_ad", label: "Facebook ad" },
    { value: "google_ad", label: "Google ad" },
    { value: "google_search", label: "Google search / maps" },
  ],
  reference: [
    { value: "existing_vendor", label: "Existing vendor" },
    { value: "previous_customer", label: "Previous customer" },
  ],
};

export function sourceDetailLabel(source: OrderSource, detail: string | null | undefined): string | null {
  if (!detail) return null;
  return SOURCE_DETAILS[source]?.find((d) => d.value === detail)?.label ?? detail;
}

// ---------- Finance ----------

export const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", cheque: "Cheque" };

export const EXPENSE_CATEGORIES = ["porter", "delivery", "factory", "production", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  porter: "Porter (order transport)",
  delivery: "Delivery",
  factory: "Factory",
  production: "Daily production",
  other: "Other",
};

// ---------- Inventory ----------

export const INVENTORY_CATEGORIES = ["profile", "handle", "sliding", "kit", "hardware", "glass", "consumable"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  profile: "Profiles & frames",
  handle: "Handles",
  sliding: "Sliding door parts",
  kit: "Kits",
  hardware: "Hardware",
  glass: "Glass",
  consumable: "Consumables",
};

export const INVENTORY_UNITS = ["piece", "bar", "set", "sqft", "rft", "tube", "box", "roll", "kg"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];
export const UNIT_LABELS: Record<InventoryUnit, string> = {
  piece: "pcs",
  bar: "bars",
  set: "sets",
  sqft: "sq ft",
  rft: "r ft",
  tube: "tubes",
  box: "boxes",
  roll: "rolls",
  kg: "kg",
};

export const MOVEMENT_KINDS = ["in", "out", "adjust"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
