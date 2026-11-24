import type {
  ExpenseCategory,
  FollowupStatus,
  GlassGroup,
  InventoryCategory,
  InventoryUnit,
  MovementKind,
  OrderFamily,
  OrderSource,
  OrderStage,
  PaymentMethod,
  PaymentTerms,
  PricingModel,
  Rates,
} from "./domain";
import type { Estimate, MaterialUsage } from "./pricing";

// Shapes the API returns. Dates are ISO strings; calendar days are "YYYY-MM-DD".

// ---------- Catalogue ----------

export interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
  sort: number;
}
export interface Catalog {
  orderTypes: (CatalogItem & { family: OrderFamily; handleTypes: CatalogItem[] })[];
  frameTypes: CatalogItem[];
  frameColours: CatalogItem[];
  glassTypes: (CatalogItem & { glassGroup: GlassGroup })[];
  handlePositions: CatalogItem[];
  dividers: CatalogItem[];
}

// ---------- Vendors ----------

export type VendorHealth = "good" | "watch" | "at_risk" | "new";

export interface VendorStats {
  orders: number;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  maxDaysOverdue: number;
  onTimeRate: number | null;
  avgDaysLate: number | null;
  lastOrderDate: string | null;
  health: VendorHealth;
}

export interface VendorListItem {
  id: string;
  code: string;
  firmName: string;
  isWalkIn: boolean;
  isActive: boolean;
  gstin: string | null;
  state: string | null;
  contact1Name: string | null;
  contact1Phone: string | null;
  pricingModel: PricingModel;
  paymentTerms: PaymentTerms;
  stats: VendorStats;
  openFollowups: number;
}

export interface Followup {
  id: string;
  vendorId: string;
  vendorName: string;
  reason: string;
  notes: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  status: FollowupStatus;
  outcome: string | null;
  createdByName: string | null;
  createdAt: string;
  doneAt: string | null;
}

export interface VendorDetail extends Omit<VendorListItem, "stats" | "openFollowups"> {
  legalName: string | null;
  tradeName: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  gstStatus: string | null;
  businessType: string | null;
  taxpayerType: string | null;
  gstRegisteredOn: string | null;
  gstCheckedAt: string | null;
  branches: number;
  rates: Rates;
  discountPercent: number;
  deliveryTerms: string | null;
  paymentDays: number | null;
  paymentNote: string | null;
  contact1Email: string | null;
  contact2Name: string | null;
  contact2Phone: string | null;
  contact2Email: string | null;
  remarks: string | null;
  createdAt: string;
  stats: VendorStats;
  monthly: { month: string; orders: number; value: number; paid: number }[];
  recentOrders: OrderListItem[];
  followups: Followup[];
}

export interface GstLookup {
  valid: boolean;
  reason?: string;
  gstin?: string;
  state?: string | null;
  pan?: string;
  /** Filled only when a GST API is configured. `branches` counts the principal place plus any others. */
  details?: {
    legalName?: string;
    tradeName?: string;
    address?: string;
    city?: string;
    pincode?: string;
    state?: string;
    status?: string;
    businessType?: string;
    taxpayerType?: string;
    registeredOn?: string;
    branches?: number;
  } | null;
  source: "offline" | "api";
  message?: string;
}

// ---------- Orders ----------

export interface OrderListItem {
  id: string;
  code: string;
  vendorId: string;
  vendorName: string;
  customerName: string | null;
  projectName: string | null;
  location: string | null;
  stage: OrderStage;
  onHold: boolean;
  holdReason: string | null;
  orderDate: string;
  expectedDelivery: string | null;
  total: number;
  paid: number;
  shutters: number;
  stageChangedAt: string;
}

export interface OrderItemView {
  id: string;
  position: number;
  orderType: string;
  family: OrderFamily;
  frameType: string;
  frameColour: string;
  glassType: string;
  glassGroup: GlassGroup;
  widthMm: number;
  heightMm: number;
  handlePosition: string;
  handleType: string;
  handleColour: string;
  divider: string;
  hingeHoles: number;
  quantity: number;
  sqft: number;
  amount: number;
}

export interface OrderEventView {
  id: string;
  kind: string;
  fromStage: OrderStage | null;
  toStage: OrderStage | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

export interface PaymentView {
  id: string;
  orderId: string;
  orderCode: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidOn: string;
  note: string | null;
  recordedByName: string | null;
}

export interface ExpenseView {
  id: string;
  category: ExpenseCategory;
  orderId: string | null;
  orderCode: string | null;
  amount: number;
  spentOn: string;
  description: string | null;
  recordedByName: string | null;
}

export interface ReturnView {
  id: string;
  orderId: string;
  orderCode: string;
  vendorName: string;
  amount: number;
  items: string | null;
  reason: string;
  returnedOn: string;
  recordedByName: string | null;
}

/** A raw material supplier. `spent` is only sent to people who can view Finance. */
export interface SupplierView {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  gstin: string | null;
  supplies: string | null;
  notes: string | null;
  isActive: boolean;
  purchases: number;
  spent: number | null;
  lastPurchase: string | null;
}

export interface PurchaseView {
  id: string;
  supplierName: string;
  invoiceNo: string | null;
  purchasedOn: string;
  amount: number;
  description: string | null;
  recordedByName: string | null;
}

export interface OrderDetail extends OrderListItem {
  vendorCode: string;
  vendorIsWalkIn: boolean;
  vendorPaymentTerms: PaymentTerms;
  vendorPricingModel: PricingModel;
  customerPhone: string | null;
  pmName: string | null;
  pmPhone: string | null;
  source: OrderSource;
  sourceDetail: string | null;
  notes: string | null;
  cancelReason: string | null;
  heldAt: string | null;
  deliveredAt: string | null;
  dueDate: string | null;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  gstAmount: number;
  pricing: Estimate | null;
  items: OrderItemView[];
  events: OrderEventView[];
  payments: PaymentView[];
  returns: ReturnView[];
  expenses: ExpenseView[];
  credited: number;
  balance: number;
  materials: MaterialUsage;
  createdByName: string | null;
  createdAt: string;
}

export interface OrderBoard {
  counts: Record<OrderStage, number>;
  onHold: number;
  overdueDelivery: number;
}

/** Everything the Orders overview draws. */
export interface OrderInsights {
  phases: { pre: number; production: number; dispatched: number };
  stages: { stage: OrderStage; count: number }[];
  delivery: { onTrack: number; late: number; noDate: number };
  onHold: { id: string; code: string; vendorName: string; reason: string | null; daysHeld: number }[];
  waiting: { id: string; code: string; vendorName: string; stage: OrderStage; days: number; onHold: boolean }[];
  /** Active shutters by order type. */
  mix: { orderType: string; shutters: number }[];
  /** New orders per day, last 12 weeks (84 days, oldest first). */
  intake: { date: string; count: number }[];
}

// ---------- Finance ----------

export interface Receivable {
  orderId: string;
  orderCode: string;
  vendorId: string;
  vendorName: string;
  stage: OrderStage;
  total: number;
  paid: number;
  outstanding: number;
  deliveredAt: string | null;
  dueDate: string | null;
  daysOverdue: number;
}

export interface FinanceSummary {
  from: string;
  to: string;
  received: number;
  receivable: number;
  overdue: number;
  deliveredUnpaid: { count: number; amount: number };
  aging: { label: string; amount: number; count: number }[];
  expenses: { category: ExpenseCategory; amount: number }[];
  expenseTotal: number;
  returns: number;
  purchases: number;
  daily: { date: string; received: number; expenses: number }[];
  receivedByMethod: { method: PaymentMethod; amount: number }[];
}

export interface OrderOption {
  id: string;
  code: string;
  vendorName: string;
  customerName: string | null;
  total: number;
  outstanding: number;
}

// ---------- Inventory ----------

export interface InventoryVariantView {
  id: string;
  colour: string;
  stock: number;
  reorderLevel: number;
  unitCost: number | null;
  isActive: boolean;
  usedLast30: number;
  daysLeft: number | null;
  low: boolean;
}

export interface InventoryItemView {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  colourCount: number | null;
  notes: string | null;
  isActive: boolean;
  variants: InventoryVariantView[];
}

export interface InventoryUsage {
  months: string[];
  byCategory: { category: InventoryCategory; values: number[] }[];
  topItems: { itemId: string; name: string; unit: InventoryUnit; values: number[] }[];
}

export interface MovementView {
  id: string;
  variantId: string;
  itemName: string;
  colour: string;
  unit: InventoryUnit;
  kind: MovementKind;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  orderCode: string | null;
  userName: string | null;
  movedOn: string;
  createdAt: string;
}

// ---------- Sales ----------

export interface SalesPoint {
  date: string;
  orders: number;
  value: number;
}

export interface SalesOverview {
  month: string;
  thisMonth: { orders: number; value: number };
  lastMonthToDate: { orders: number; value: number };
  daily: SalesPoint[];
  monthly: { month: string; orders: number; value: number }[];
}

export interface SalesRange {
  from: string;
  to: string;
  current: SalesPoint[];
  previous: SalesPoint[];
  totals: { orders: number; value: number };
  previousTotals: { orders: number; value: number };
}

/** One chosen day in the "compare days" view: totals and the orders placed that day. */
export interface SalesDay {
  date: string;
  orders: number;
  value: number;
  shutters: number;
  list: { id: string; code: string; vendorName: string; customerName: string | null; value: number }[];
}

export interface ProductStat {
  name: string;
  orders: number;
  shutters: number;
  sqft: number;
  value: number;
  lastSold: string | null;
}

export interface SalesProducts {
  orderTypes: ProductStat[];
  frameTypes: ProductStat[];
  glassTypes: ProductStat[];
  handleTypes: ProductStat[];
}

export interface SalesSources {
  sources: { source: OrderSource; orders: number; value: number; details: { detail: string; orders: number; value: number }[] }[];
}
