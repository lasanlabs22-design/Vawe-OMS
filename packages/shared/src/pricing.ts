import type { GlassGroup, OrderFamily, PricingModel, Rates } from "./domain";

// The estimate, rebuilt from the client's DWG workbook (Calculation sheet), with its two bugs fixed:
//   1. The workbook checked for "Profile Shutters" (plural), so profile-shutter pricing never ran and
//      every order was priced as sliding. Here each item is priced by its own order type's family.
//   2. The workbook priced the whole order by the first item's order type. Here mixed orders work.
//
// Rules kept from the workbook:
//   area      = W/304.8 × H/304.8 × qty (mm → sq ft), plus a 1 sq ft allowance per group
//   groups    = items sharing family + frame type + handle type + glass type
//   sliding   = (area + 1) × the glass's FTC rate
//   profile shutter, SQFT vendor = (area + 1) × regular or fluted sq ft rate
//   profile shutter, RFT vendor  = perimeter RFT × 1.1 × profile rate
//                                + (area + 1) × regular or fluted glass rate
//                                + making charge × shutters
// Where the workbook had no rate (e.g. a lacquered profile shutter) the glass's FTC rate is used.

const MM_PER_FT = 304.8;
const RFT_WASTAGE = 1.1;
const GROUP_ALLOWANCE_SQFT = 1;
export const DEFAULT_GST_PERCENT = 18;

export interface PricedItemInput {
  family: OrderFamily;
  frameType: string;
  handleType: string;
  glassType: string;
  glassGroup: GlassGroup;
  widthMm: number;
  heightMm: number;
  quantity: number;
}

export interface PricingVendor {
  pricingModel: PricingModel;
  rates: Rates;
  discountPercent: number;
}

export interface EstimateGroup {
  key: string;
  family: OrderFamily;
  frameType: string;
  handleType: string;
  glassType: string;
  shutters: number;
  sqft: number;
  rft: number;
  lines: { label: string; quantity: number; unit: string; rate: number; amount: number }[];
  amount: number;
}

export interface Estimate {
  groups: EstimateGroup[];
  /** Same order as the input items: each item's share of its group's amount (by area). */
  itemAmounts: number[];
  itemSqft: number[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function itemSqft(i: Pick<PricedItemInput, "widthMm" | "heightMm" | "quantity">): number {
  return (i.widthMm / MM_PER_FT) * (i.heightMm / MM_PER_FT) * i.quantity;
}

export function itemRft(i: Pick<PricedItemInput, "widthMm" | "heightMm" | "quantity">): number {
  return ((2 * i.widthMm + 2 * i.heightMm) / MM_PER_FT) * i.quantity * RFT_WASTAGE;
}

function ftcRateKey(group: GlassGroup): keyof Rates | null {
  switch (group) {
    case "regular":
    case "fluted":
    case "lacquered":
      return "ftcLacquered";
    case "digital_print":
      return "ftcDigitalPrint";
    case "laminate_insertion":
      return "ftcLaminateInsertion";
    case "cane":
      return "ftcCane";
    case "laminate_glass":
      return "ftcLaminateGlass";
    case "none":
      return null;
  }
}

const RATE_LABEL: Record<keyof Rates, string> = {
  sqftRegular: "SQFT regular",
  sqftFluted: "SQFT fluted",
  rftProfile: "RFT profile",
  rftGlassRegular: "RFT regular glass",
  rftGlassFluted: "RFT fluted glass",
  ftcLacquered: "FTC lacquered",
  ftcDigitalPrint: "FTC digital print",
  ftcLaminateInsertion: "FTC laminate insertion",
  ftcCane: "FTC cane",
  ftcLaminateGlass: "FTC laminate glass",
  makingCharge: "making charge",
};

/**
 * Prices an order's items for one vendor. `fallback` is the default price list, used for any rate
 * this vendor doesn't have.
 */
export function estimate(items: PricedItemInput[], vendor: PricingVendor, fallback: Rates = {}, gstPercent = DEFAULT_GST_PERCENT): Estimate {
  const warnings = new Set<string>();
  const rate = (key: keyof Rates): number => {
    const v = vendor.rates[key] ?? fallback[key];
    if (v === undefined || v === null || Number.isNaN(v)) {
      warnings.add(`No ${RATE_LABEL[key]} rate for this vendor or in the default price list`);
      return 0;
    }
    return v;
  };

  const byKey = new Map<string, { group: EstimateGroup; indexes: number[] }>();
  items.forEach((item, index) => {
    const key = [item.family, item.frameType, item.handleType, item.glassType].join("|");
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        group: { key, family: item.family, frameType: item.frameType, handleType: item.handleType, glassType: item.glassType, shutters: 0, sqft: 0, rft: 0, lines: [], amount: 0 },
        indexes: [],
      };
      byKey.set(key, entry);
    }
    entry.group.shutters += item.quantity;
    entry.group.sqft += itemSqft(item);
    entry.group.rft += itemRft(item);
    entry.indexes.push(index);
  });

  const itemAmounts = items.map(() => 0);
  const itemSqfts = items.map((i) => round2(itemSqft(i)));

  for (const { group, indexes } of byKey.values()) {
    const glassGroup = items[indexes[0]!]!.glassGroup;
    const area = group.sqft + GROUP_ALLOWANCE_SQFT;
    const add = (label: string, quantity: number, unit: string, r: number) => {
      group.lines.push({ label, quantity: round2(quantity), unit, rate: r, amount: round2(quantity * r) });
    };
    const ftcKey = ftcRateKey(glassGroup);

    if (group.family === "sliding") {
      if (ftcKey) add(`${group.glassType} (FTC)`, area, "sq ft", rate(ftcKey));
    } else if (vendor.pricingModel === "sqft") {
      if (glassGroup === "regular") add("Shutter, regular glass", area, "sq ft", rate("sqftRegular"));
      else if (glassGroup === "fluted") add("Shutter, fluted glass", area, "sq ft", rate("sqftFluted"));
      else if (ftcKey) add(`Shutter, ${group.glassType}`, area, "sq ft", rate(ftcKey));
      else add("Shutter, no glass", area, "sq ft", rate("sqftRegular"));
    } else {
      add(`Profile ${group.frameType}`, group.rft, "r ft", rate("rftProfile"));
      if (glassGroup === "regular") add(`Glass: ${group.glassType}`, area, "sq ft", rate("rftGlassRegular"));
      else if (glassGroup === "fluted") add(`Glass: ${group.glassType}`, area, "sq ft", rate("rftGlassFluted"));
      else if (ftcKey) add(`Glass: ${group.glassType}`, area, "sq ft", rate(ftcKey));
      add("Making charge", group.shutters, "shutters", rate("makingCharge"));
    }

    group.amount = round2(group.lines.reduce((s, l) => s + l.amount, 0));
    group.sqft = round2(group.sqft);
    group.rft = round2(group.rft);

    // Share the group's amount between its items by area (equal shares if every area is zero).
    const areas = indexes.map((i) => itemSqft(items[i]!));
    const totalArea = areas.reduce((s, a) => s + a, 0);
    indexes.forEach((itemIndex, k) => {
      itemAmounts[itemIndex] = round2(totalArea > 0 ? (group.amount * areas[k]!) / totalArea : group.amount / indexes.length);
    });
  }

  const groups = [...byKey.values()].map((e) => e.group);
  const subtotal = round2(groups.reduce((s, g) => s + g.amount, 0));
  const discountPercent = vendor.discountPercent || 0;
  const discountAmount = round2((subtotal * discountPercent) / 100);
  const gstAmount = round2(((subtotal - discountAmount) * gstPercent) / 100);
  return {
    groups,
    itemAmounts,
    itemSqft: itemSqfts,
    subtotal,
    discountPercent,
    discountAmount,
    gstPercent,
    gstAmount,
    total: round2(subtotal - discountAmount + gstAmount),
    warnings: [...warnings],
  };
}

/** Rough materials an order will use, for planning and stock-out. */
export interface MaterialUsage {
  profiles: { name: string; rft: number }[];
  glass: { name: string; sqft: number }[];
  handles: { name: string; count: number }[];
  hinges: number;
  shutters: number;
}

export function materialUsage(
  items: (PricedItemInput & { frameColour: string; handleColour: string; hingeHoles: number })[],
): MaterialUsage {
  const profiles = new Map<string, number>();
  const glass = new Map<string, number>();
  const handles = new Map<string, number>();
  let hinges = 0;
  let shutters = 0;
  for (const i of items) {
    shutters += i.quantity;
    if (i.family === "profile_shutter") {
      const p = `${i.frameType} ${i.frameColour}`;
      profiles.set(p, (profiles.get(p) ?? 0) + itemRft(i));
      hinges += i.hingeHoles * i.quantity;
    }
    if (i.glassGroup !== "none") glass.set(i.glassType, (glass.get(i.glassType) ?? 0) + itemSqft(i));
    if (!/no handle/i.test(i.handleType)) {
      // Handles are stocked per colour, so they're counted per type and colour.
      const h = `${i.handleType} ${i.handleColour}`;
      handles.set(h, (handles.get(h) ?? 0) + i.quantity);
    }
  }
  const list = <K extends string>(m: Map<string, number>, k: K) => [...m].map(([name, v]) => ({ name, [k]: round2(v) }) as { name: string } & Record<K, number>);
  return { profiles: list(profiles, "rft"), glass: list(glass, "sqft"), handles: list(handles, "count"), hinges, shutters };
}
