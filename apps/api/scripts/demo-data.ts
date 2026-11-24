// Fills a local database with fictional vendors, orders, payments, expenses and stock, through the
// API (so everything passes the same validation as real use). For demos and screenshots only.
//
//   pnpm demo --email admin@vaweinterio.in --password "..." [--api http://localhost:4000] [--orders 90]
//
// Refuses to run against anything but localhost.
import { parseArgs } from "node:util";
import type { Catalog, InventoryItemView, OrderDetail } from "@vawe/shared";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    api: { type: "string", default: "http://localhost:4000" },
    orders: { type: "string", default: "90" },
  },
});
const API = values.api!;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error("Demo data only goes into a local API");
if (!values.email || !values.password) throw new Error('Pass --email and --password of an admin');

let cookie = "";
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const s of res.headers.getSetCookie()) cookie = s.split(";")[0]!;
  const data = (await res.json().catch(() => null)) as T & { error?: string };
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data?.error ?? ""}`);
  return data;
}

// Deterministic randomness so reruns look alike.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
const IST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

await call("POST", "/auth/login", { email: values.email, password: values.password });
const catalog = await call<Catalog>("GET", "/v1/catalog");

const rates = await call<Record<string, number>>("GET", "/v1/settings/rates");
if (!Object.keys(rates).length) {
  await call("PUT", "/v1/settings/rates", { sqftRegular: 450, sqftFluted: 540, rftProfile: 127, rftGlassRegular: 76, rftGlassFluted: 150, ftcLacquered: 750, ftcDigitalPrint: 1000, ftcLaminateInsertion: 720, ftcCane: 1525, ftcLaminateGlass: 1240, makingCharge: 199 });
}

const VENDORS = [
  { firmName: "Demo Modular Studio", pricingModel: "rft", paymentTerms: "net_15" },
  { firmName: "Demo Home Interiors", pricingModel: "sqft", paymentTerms: "net_30" },
  { firmName: "Demo Design House", pricingModel: "rft", paymentTerms: "before_delivery" },
  { firmName: "Demo Living Spaces", pricingModel: "sqft", paymentTerms: "monthly" },
  { firmName: "Demo Kitchen Works", pricingModel: "rft", paymentTerms: "advance" },
] as const;

const existing = await call<{ id: string; firmName: string; isWalkIn: boolean }[]>("GET", "/v1/vendor-options");
const vendorIds: string[] = [];
for (const v of VENDORS) {
  const found = existing.find((e) => e.firmName === v.firmName);
  if (found) vendorIds.push(found.id);
  else vendorIds.push((await call<{ id: string }>("POST", "/v1/vendors", { ...v, remarks: "Fictional vendor for demos" })).id);
}
const walkIn = existing.find((e) => e.isWalkIn)!.id;

const SOURCES: [string, string | null][] = [
  ["b2b_vendor", null],
  ["b2b_vendor", null],
  ["b2b_vendor", null],
  ["direct_walkin", null],
  ["social_media", "instagram_reel"],
  ["social_media", "instagram_ad"],
  ["social_media", "google_ad"],
  ["social_media", "facebook_ad"],
  ["offline_marketing", null],
  ["reference", "previous_customer"],
  ["reference", "existing_vendor"],
];
const FLOW = ["qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment", "in_production", "cutting", "glass_cutting", "drilling", "hinge_holes", "assembly", "packaging", "route_planning", "dispatched", "delivered"];
const today = IST();
const total = Number(values.orders);

function item() {
  const ot = rand() < 0.62 ? catalog.orderTypes[0]! : pick(catalog.orderTypes.slice(1));
  const profile = ot.family === "profile_shutter";
  const handlePosition = profile ? pick(["Right", "Left", "Right", "Left", "Top"]) : "Right";
  const glass = profile ? pick(catalog.glassTypes.filter((g) => g.glassGroup !== "none")) : pick(catalog.glassTypes.filter((g) => ["lacquered", "digital_print", "fluted", "regular"].includes(g.glassGroup)));
  return {
    orderType: ot.name,
    frameType: profile ? pick(["45 MM", "20 MM", "20 MM CNC", "50 MM Bella", "55 MM Leather"]) : "FTC",
    frameColour: pick(["Black", "Champion", "Rose Gold", "Gold", "Brush Gold", "CP Brush"]),
    handleColour: pick(["Black", "Champion", "Rose Gold", "Gold", "Brush Gold", "CP Brush"]),
    glassType: glass.name,
    widthMm: between(profile ? 380 : 900, profile ? 650 : 2400),
    heightMm: between(profile ? 700 : 1900, profile ? 2400 : 2700),
    handlePosition,
    handleType: pick(ot.handleTypes).name,
    divider: handlePosition === "Top" || !profile ? pick(["No Divider", "No Divider", "Double Center Line"].filter((d) => handlePosition !== "Top" || d === "No Divider")) : pick(["No Divider", "Single Center Line", "Double Center Line", "Single Check - 3 Row"]),
    hingeHoles: between(2, 5),
    quantity: profile ? between(1, 6) : between(1, 3),
  };
}

let made = 0;
for (let i = 0; i < total; i++) {
  // Spread over the last ~120 days, a little busier recently.
  const ago = Math.floor(Math.pow(rand(), 1.3) * 120);
  const orderDate = addDays(today, -ago);
  const [source, sourceDetail] = pick(SOURCES);
  const vendorId = source === "direct_walkin" || source === "social_media" ? (rand() < 0.7 ? walkIn : pick(vendorIds)) : pick(vendorIds);
  const order = await call<OrderDetail>("POST", "/v1/orders", {
    vendorId,
    customerName: pick(["Rahul", "Priya", "Arjun", "Meera", "Kiran", "Anita", "Suresh", "Divya"]) + " " + pick(["K", "R", "S", "M", "N"]),
    projectName: pick(["Villa", "Apartment", "Office", "Penthouse", "Studio"]) + " " + between(1, 40),
    location: pick(["Whitefield", "HSR Layout", "Indiranagar", "Jayanagar", "Hebbal", "Sarjapur", "Electronic City"]),
    pmName: pick(["Anil", "Deepa", "Farhan", "Lakshmi"]),
    pmPhone: `98${between(10000000, 99999999)}`,
    source,
    sourceDetail,
    orderDate,
    items: Array.from({ length: between(1, 4) }, item),
  });
  // Older orders are further along.
  const progress = ago > 30 ? FLOW.length : Math.min(FLOW.length, Math.floor((1 - ago / 35) * FLOW.length * rand() + ago / 6));
  if (rand() < 0.04) {
    await call("POST", `/v1/orders/${order.id}/cancel`, { reason: "Client changed plans" });
  } else {
    for (const stage of FLOW.slice(0, progress)) await call("POST", `/v1/orders/${order.id}/stage`, { stage });
    if (progress > 4 && progress < 10 && rand() < 0.2) await call("POST", `/v1/orders/${order.id}/hold`, { reason: pick(["Glass not in stock", "Waiting for profile delivery", "Handles on order"]) });
    // Payments: advance, then some or all of the balance.
    if (progress >= 4) {
      const advance = Math.round(order.total * pick([0.3, 0.5, 0.5]));
      await call("POST", "/v1/payments", { orderId: order.id, amount: advance, method: pick(["upi", "bank_transfer", "cash", "upi"]), paidOn: addDays(orderDate, between(1, 4)) > today ? today : addDays(orderDate, between(1, 4)) });
      if (progress === FLOW.length && rand() < 0.65) {
        const rest = Math.round((order.total - advance) * 100) / 100;
        const day = addDays(orderDate, between(8, 40));
        await call("POST", "/v1/payments", { orderId: order.id, amount: rest, method: pick(["bank_transfer", "upi", "cheque"]), paidOn: day > today ? today : day });
      }
    }
    if (progress >= 11) {
      await call("POST", "/v1/expenses", { category: "porter", orderId: order.id, amount: between(400, 1800), spentOn: addDays(orderDate, Math.min(ago, between(5, 15))) });
    }
  }
  made++;
  if (made % 10 === 0) console.log(`${made} orders…`);
}

// Daily production and factory costs, purchases.
for (let d = 0; d < 90; d++) {
  const day = addDays(today, -d);
  if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) continue;
  await call("POST", "/v1/expenses", { category: "production", amount: between(2500, 6500), spentOn: day, description: "Labour and consumables" });
  if (rand() < 0.15) await call("POST", "/v1/expenses", { category: "factory", amount: between(1500, 9000), spentOn: day, description: pick(["Electricity", "Machine service", "Rent share"]) });
  if (rand() < 0.08) await call("POST", "/v1/purchases", { supplierName: pick(["Demo Glass Traders", "Demo Aluminium Co", "Demo Hardware Mart"]), purchasedOn: day, amount: between(15000, 90000) });
}

// Stock: a few coloured lines and usage over the last 3 months.
const inv = await call<InventoryItemView[]>("GET", "/v1/inventory");
for (const name of ["45mm frame", "20mm frame", "20mm CNC frame", "45mm I handle", "68mm G handle", "C handle"]) {
  const it = inv.find((x) => x.name === name);
  if (!it) continue;
  for (const colour of ["Black", "Champion", "Rose Gold"]) {
    if (it.variants.some((v) => v.colour === colour)) continue;
    const v = await call<{ id: string }>("POST", `/v1/inventory/items/${it.id}/variants`, { colour, reorderLevel: between(8, 20), openingStock: between(120, 260), unitCost: between(600, 1800) });
    for (let d = 100; d > 0; d -= between(2, 6)) {
      await call("POST", "/v1/inventory/movements", { kind: "out", variantId: v.id, quantity: between(1, 4), movedOn: addDays(today, -d), reason: "Production" }).catch(() => {});
    }
  }
}
for (const it of inv.filter((x) => x.variants.length)) {
  for (const v of it.variants) {
    if (v.stock > 0) continue;
    await call("POST", "/v1/inventory/movements", { kind: "in", variantId: v.id, quantity: between(5, 60), movedOn: addDays(today, -95), reason: "Opening stock" });
    for (let d = 90; d > 0; d -= between(5, 14)) {
      await call("POST", "/v1/inventory/movements", { kind: "out", variantId: v.id, quantity: between(1, 3), movedOn: addDays(today, -d), reason: "Production" }).catch(() => {});
    }
  }
}
console.log(`Done: ${made} orders with payments, expenses, purchases and stock movements.`);
