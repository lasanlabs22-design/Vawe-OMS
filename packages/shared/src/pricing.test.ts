import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGstin } from "./gstin";
import { estimate, itemRft, itemSqft, materialUsage, type PricedItemInput } from "./pricing";

const rftVendor = {
  pricingModel: "rft" as const,
  rates: { rftProfile: 127, rftGlassRegular: 76, rftGlassFluted: 150, ftcLacquered: 750, ftcDigitalPrint: 1000, makingCharge: 199 },
  discountPercent: 0,
};

const shutter: PricedItemInput = {
  family: "profile_shutter",
  frameType: "20 MM",
  handleType: "Bella 200 MM",
  glassType: "Clear Glass",
  glassGroup: "regular",
  widthMm: 600,
  heightMm: 2100,
  quantity: 2,
};

test("area and running feet follow the workbook (mm → ft, 10% profile wastage)", () => {
  assert.equal(itemSqft({ widthMm: 304.8, heightMm: 304.8, quantity: 1 }), 1);
  assert.ok(Math.abs(itemRft({ widthMm: 304.8, heightMm: 304.8, quantity: 1 }) - 4.4) < 1e-9);
});

test("RFT profile shutter = profile + glass (+1 sq ft per group) + making charge", () => {
  const e = estimate([shutter], rftVendor, {}, 0);
  const sqft = itemSqft(shutter);
  const expected = itemRft(shutter) * 127 + (sqft + 1) * 76 + 2 * 199;
  assert.ok(Math.abs(e.subtotal - expected) < 0.05, `${e.subtotal} vs ${expected}`);
  assert.equal(e.warnings.length, 0);
});

test("each item is priced by its own family (the workbook priced all items by the first)", () => {
  const sliding: PricedItemInput = { ...shutter, family: "sliding", frameType: "FTC", handleType: "C Handle", glassType: "Digital Print", glassGroup: "digital_print", quantity: 1 };
  const e = estimate([sliding, shutter], rftVendor, {}, 0);
  assert.equal(e.groups.length, 2);
  const slidingGroup = e.groups.find((g) => g.family === "sliding")!;
  assert.ok(Math.abs(slidingGroup.amount - (itemSqft(sliding) + 1) * 1000) < 0.05);
  assert.ok(e.groups.find((g) => g.family === "profile_shutter")!.lines.some((l) => l.label === "Making charge"));
});

test("SQFT vendors, discount and GST", () => {
  const e = estimate([shutter], { pricingModel: "sqft", rates: { sqftRegular: 450 }, discountPercent: 5 }, {}, 18);
  const sub = (itemSqft(shutter) + 1) * 450;
  assert.ok(Math.abs(e.subtotal - sub) < 0.05);
  assert.ok(Math.abs(e.discountAmount - sub * 0.05) < 0.05);
  assert.ok(Math.abs(e.total - sub * 0.95 * 1.18) < 0.1);
});

test("missing rates fall back to the default list, else warn", () => {
  const withFallback = estimate([shutter], { pricingModel: "sqft", rates: {}, discountPercent: 0 }, { sqftRegular: 400 }, 0);
  assert.equal(withFallback.warnings.length, 0);
  const without = estimate([shutter], { pricingModel: "sqft", rates: {}, discountPercent: 0 }, {}, 0);
  assert.equal(without.subtotal, 0);
  assert.equal(without.warnings.length, 1);
});

test("item amounts add up to the subtotal", () => {
  const e = estimate([shutter, { ...shutter, widthMm: 450 }], rftVendor, {}, 0);
  const sum = e.itemAmounts.reduce((s, a) => s + a, 0);
  assert.ok(Math.abs(sum - e.subtotal) < 0.05);
});

test("material usage counts hinges and handles", () => {
  const m = materialUsage([{ ...shutter, frameColour: "Black", hingeHoles: 4 }]);
  assert.equal(m.hinges, 8);
  assert.equal(m.handles[0]?.count, 2);
  assert.equal(m.profiles[0]?.name, "20 MM Black");
});

test("GSTIN check digit, format and state", () => {
  const ok = checkGstin("29AAPFH1272A1ZI");
  assert.ok(ok.valid && ok.state === "Karnataka" && ok.pan === "AAPFH1272A");
  assert.equal(checkGstin("37bkjpm3777l1ze").valid, true);
  assert.equal(checkGstin("29AAPFH1272A1ZX").valid, false);
  assert.equal(checkGstin("12345").valid, false);
});
