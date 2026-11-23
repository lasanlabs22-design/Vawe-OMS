// Imports vendors, their contacts, payment terms and rates from the client's DWG workbook
// ("Vendor Details" sheet), and sets the default price list from the most common rates.
//
//   pnpm import:workbook --file "C:\path\Vawe - DWG File.xlsm" --dry-run     preview, change nothing
//   pnpm import:workbook --file "C:\path\Vawe - DWG File.xlsm"               import
//   pnpm import:workbook --file ... --update                                 also update vendors that exist
//
// Reads the file from disk at run time, so the client's data never goes into this repository.
// Uses DATABASE_URL from apps/api/.env (the live database) or the embedded dev database (stop
// `pnpm dev` first in that case: only one process can open it).
import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { appSettings, closeDb, getDb, seedReferenceData, vendors } from "@vawe/db";
import { checkGstin, type PaymentTerms, type Rates } from "@vawe/shared";
import { nextVendorCode } from "../src/lib/counters";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    update: { type: "boolean", default: false },
  },
});
if (!values.file) throw new Error('Pass --file "path to the .xlsm"');
const dryRun = values["dry-run"];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(values.file);
const sheet = wb.getWorksheet("Vendor Details");
if (!sheet) throw new Error('No "Vendor Details" sheet in that file');

const text = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "").trim();
  if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "").trim();
  return String(v).trim();
};
const num = (v: unknown): number | undefined => {
  const t = text(v).replace(/[₹,\s]/g, "");
  if (!t || t === "-") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const phone = (v: unknown): string | null => {
  const digits = text(v).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

function terms(raw: string): { paymentTerms: PaymentTerms; paymentNote: string | null } {
  const t = raw.toLowerCase();
  if (!t) return { paymentTerms: "before_delivery", paymentNote: null };
  if (t.includes("15 days")) return { paymentTerms: "net_15", paymentNote: raw };
  if (t.includes("30 days")) return { paymentTerms: "net_30", paymentNote: raw };
  if (t.includes("before delivery")) return { paymentTerms: "before_delivery", paymentNote: raw };
  if (t.includes("month")) return { paymentTerms: "monthly", paymentNote: raw };
  return { paymentTerms: "before_delivery", paymentNote: raw };
}

type Parsed = typeof vendors.$inferInsert & { warnings: string[] };
const parsed = new Map<string, Parsed>();

sheet.eachRow((row, r) => {
  if (r < 3) return; // two header rows
  const name = text(row.getCell("A").value);
  if (!name) return;
  if (name.toLowerCase() === "direct cx") return; // the walk-in vendor already exists
  const warnings: string[] = [];

  const gstRaw = text(row.getCell("B").value);
  const gst = gstRaw ? checkGstin(gstRaw) : null;
  if (gst && !gst.valid) warnings.push(`GSTIN "${gstRaw}" skipped: ${gst.reason}`);

  const c1Name = text(row.getCell("C").value);
  const c1Phone = row.getCell("D").value;
  const c2Name = text(row.getCell("E").value);
  const c2Phone = row.getCell("F").value;
  const primary = c1Name || text(c1Phone) ? { name: c1Name, phone: c1Phone } : { name: c2Name, phone: c2Phone };
  const secondary = c1Name || text(c1Phone) ? { name: c2Name, phone: c2Phone } : { name: "", phone: null };
  for (const p of [primary, secondary]) if (text(p.phone) && !phone(p.phone)) warnings.push(`Phone "${text(p.phone)}" isn't a 10-digit mobile; kept in remarks`);

  const model = text(row.getCell("H").value).toUpperCase();
  const [cane, laminate] = text(row.getCell("S").value).split("/").map((s) => num(s));
  const rates: Rates = {
    sqftRegular: num(row.getCell("I").value),
    sqftFluted: num(row.getCell("J").value),
    rftProfile: num(row.getCell("L").value),
    rftGlassRegular: num(row.getCell("M").value),
    rftGlassFluted: num(row.getCell("N").value),
    ftcLacquered: num(row.getCell("P").value),
    ftcDigitalPrint: num(row.getCell("Q").value),
    ftcLaminateInsertion: num(row.getCell("R").value),
    ftcCane: cane,
    ftcLaminateGlass: laminate,
  };
  for (const k of Object.keys(rates) as (keyof Rates)[]) if (rates[k] === undefined) delete rates[k];

  const { paymentTerms, paymentNote } = terms(text(row.getCell("W").value));
  const delivery = text(row.getCell("U").value);
  const remarks = [
    text(row.getCell("X").value),
    ...[primary, secondary].filter((p) => text(p.phone) && !phone(p.phone)).map((p) => `Phone as written: ${text(p.phone)}`),
  ]
    .filter(Boolean)
    .join(" · ");

  const branches = num(row.getCell("G").value);
  const entry: Parsed = {
    code: "",
    firmName: name,
    gstin: gst?.valid ? gst.gstin : null,
    state: gst?.valid ? gst.state : null,
    branches: branches && branches > 0 ? Math.round(branches) : 1,
    pricingModel: model === "SQFT" ? "sqft" : "rft",
    rates,
    discountPercent: text(row.getCell("V").value).toUpperCase() === "YES" ? 5 : 0,
    deliveryTerms: delivery && delivery.toUpperCase() !== "NA" ? delivery : null,
    paymentTerms,
    paymentNote,
    contact1Name: primary.name || null,
    contact1Phone: phone(primary.phone),
    contact2Name: secondary.name || null,
    contact2Phone: phone(secondary.phone),
    remarks: remarks || null,
    warnings,
  };

  // The sheet lists some firms twice; keep the row with more filled in.
  const key = name.toLowerCase();
  const prev = parsed.get(key);
  const filled = (p: Parsed) => Object.keys(p.rates ?? {}).length + (p.gstin ? 1 : 0) + (p.contact1Name ? 1 : 0);
  if (!prev || filled(entry) >= filled(prev)) parsed.set(key, entry);
});

// Default price list: the most common value of each rate across vendors.
const defaults: Rates = { makingCharge: 199 };
const keys = new Set([...parsed.values()].flatMap((p) => Object.keys(p.rates ?? {}))) as Set<keyof Rates>;
for (const k of keys) {
  const counts = new Map<number, number>();
  for (const p of parsed.values()) {
    const v = p.rates?.[k];
    if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (top) defaults[k] = top[0];
}

console.log(`Found ${parsed.size} vendors in "${values.file}".`);
for (const p of parsed.values()) {
  console.log(`  ${p.firmName.padEnd(28)} ${(p.pricingModel ?? "rft").toUpperCase().padEnd(5)} ${(p.paymentTerms ?? "").padEnd(16)} ${p.gstin ?? "no GSTIN"}${p.warnings.length ? `  ⚠ ${p.warnings.join("; ")}` : ""}`);
}
console.log("Default price list (most common rates):", JSON.stringify(defaults));

if (dryRun) {
  console.log("\nDry run: nothing was changed. Run again without --dry-run to import.");
  process.exit(0);
}

const db = await getDb();
try {
  await seedReferenceData(db);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const p of parsed.values()) {
    const { warnings: _w, code: _c, ...data } = p;
    const [existing] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(sql`lower(${vendors.firmName}) = ${p.firmName.toLowerCase()}`)
      .limit(1);
    if (existing) {
      if (values.update) {
        await db.update(vendors).set({ ...data, updatedAt: new Date() }).where(eq(vendors.id, existing.id));
        updated++;
      } else skipped++;
      continue;
    }
    await db.insert(vendors).values({ ...data, code: await nextVendorCode(db) });
    created++;
  }
  const [hasDefaults] = await db.select().from(appSettings).where(eq(appSettings.key, "default_rates")).limit(1);
  if (!hasDefaults || values.update) {
    await db
      .insert(appSettings)
      .values({ key: "default_rates", value: defaults })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: defaults, updatedAt: new Date() } });
    console.log("Default price list set.");
  }
  console.log(`Done: ${created} created, ${updated} updated, ${skipped} already existed (use --update to refresh them).`);
} finally {
  await closeDb();
}
