import { sql } from "drizzle-orm";
import type { GlassGroup, InventoryCategory, InventoryUnit, OrderFamily } from "@vawe/shared";
import type { Db } from "./index";
import { catalogOptions, inventoryItems, inventoryVariants, vendors } from "./schema-business";

// Reference data every installation starts with, applied once on an empty database (API start-up).
// Product and option names only: vendors, contacts and prices come from the client's workbook through
// `pnpm import:workbook`, so no client data lives in this repository.

// ---------- Catalogue: the DWG workbook's Mapping sheet ----------

const ORDER_TYPES: { name: string; family: OrderFamily; handles: string[] }[] = [
  {
    name: "Profile Shutter",
    family: "profile_shutter",
    handles: ["G Handle", "I Handle", "CNC Handle 200MM", "CNC Handle 1200MM", "No Handle", "Bella 200 MM", "Bella 1200 MM", "CNC D Handle"],
  },
  { name: "FTC Sliding", family: "sliding", handles: ["C Handle", "H Handle", "I Handle", "T Handle"] },
  { name: "Synchro Sliding (2 F + 2 S)", family: "sliding", handles: ["1 Handle", "2 Handle"] },
  { name: "Synchro Sliding (2 S)", family: "sliding", handles: ["1 Handle", "2 Handle"] },
  { name: "Ghost Sliding", family: "sliding", handles: ["1 Handle", "2 Handle"] },
  ...[1, 2, 3, 4, 5].map((n) => ({ name: `Telescopic Sliding (1 F + ${n} S)`, family: "sliding" as const, handles: ["1 Handle", "2 Handle"] })),
];

const FRAME_TYPES = ["45 MM", "20 MM", "20 MM CNC", "50 MM Bella", "55 MM Leather", "FTC"];
const FRAME_COLOURS = ["Black", "Brush Gold", "Rose Gold", "Gold", "Champion", "CP Brush", "Electro Champagne", "Aluminum", "No Profile Only Glass"];
const GLASS_TYPES: [string, GlassGroup][] = [
  ["Black Tinted", "regular"],
  ["Brown Tinted", "regular"],
  ["Clear Glass", "regular"],
  ["Frosted", "regular"],
  ["Black Fluted", "fluted"],
  ["Brown Fluted", "fluted"],
  ["Clear Fluted", "fluted"],
  ["Clear Mirror", "fluted"],
  ["Brown Mirror", "fluted"],
  ["Line Fluted", "fluted"],
  ["Grey Mirror", "fluted"],
  ["Lacquered Glass", "lacquered"],
  ["Digital Print", "digital_print"],
  ["Laminate Insertion", "laminate_insertion"],
  ["Cane Glass", "cane"],
  ["Laminate Glass", "laminate_glass"],
  ["No Glass", "none"],
];
const HANDLE_POSITIONS = ["Right", "Left", "Top", "Bottom", "Only Bottom Right", "Only Bottom Left"];
const DIVIDERS = [
  "No Divider",
  "Top Only",
  "Bottom Only",
  "Top and Bottom",
  "Single Center Line",
  "Double Center Line",
  "Single Check - 2 Row",
  "Single Check - 3 Row",
  "Single Check - 4 Row",
  "Double Check - 2 Row",
  "Double Check - 3 Row",
  "Double Check - 4 Row",
  "Triple Check - 2 Row",
  "Triple Check - 3 Row",
  "Triple Check - 4 Row",
];

// ---------- Inventory: the client's handwritten IMS list ----------

type Stock = { name: string; category: InventoryCategory; unit: InventoryUnit; colours?: number; variants?: string[] };

const INVENTORY: Stock[] = [
  // Profiles & frames
  { name: "45mm frame", category: "profile", unit: "bar", colours: 9 },
  { name: "20mm frame", category: "profile", unit: "bar", colours: 5 },
  { name: "20mm CNC frame", category: "profile", unit: "bar", colours: 3 },
  { name: "16×45 frame", category: "profile", unit: "bar", colours: 3 },
  { name: "25mm air hinge profile", category: "profile", unit: "bar", colours: 3 },
  { name: "25mm pin hinge profile", category: "profile", unit: "bar", colours: 3 },
  { name: "55mm pasting profile (S.S)", category: "profile", unit: "bar", colours: 3 },
  { name: "55mm pasting profile (D.S)", category: "profile", unit: "bar", colours: 3 },
  { name: "55mm leather profile", category: "profile", unit: "bar", colours: 3 },
  { name: "55mm leather T&B", category: "profile", unit: "bar", colours: 3 },
  { name: "20mm dividers", category: "profile", unit: "bar", colours: 3 },
  // Handles
  { name: "45mm I handle", category: "handle", unit: "bar", colours: 9 },
  { name: "68mm G handle", category: "handle", unit: "bar", colours: 9 },
  { name: "20mm I handle", category: "handle", unit: "bar", colours: 5 },
  { name: "20mm CNC L handle", category: "handle", unit: "bar", colours: 3 },
  { name: "20mm CNC hockey handle", category: "handle", unit: "bar", colours: 3 },
  { name: "20mm CNC D-type handle", category: "handle", unit: "bar", colours: 3 },
  { name: "20mm vertical concealed handle", category: "handle", unit: "bar", colours: 3 },
  { name: "20mm horizontal concealed handle", category: "handle", unit: "bar", colours: 3 },
  { name: "C handle", category: "handle", unit: "bar", colours: 5 },
  { name: "H handle", category: "handle", unit: "bar", colours: 5 },
  { name: "T handle", category: "handle", unit: "bar", colours: 5 },
  { name: "Leather handles", category: "handle", unit: "piece" },
  // Sliding door parts
  { name: "Sliding door kit", category: "sliding", unit: "set", variants: ["2 door", "3 door", "4 door"] },
  { name: "Sliding door track (top & bottom)", category: "sliding", unit: "bar", colours: 5 },
  { name: "Sliding door dividers", category: "sliding", unit: "bar", colours: 5 },
  { name: "Sliding door locks", category: "sliding", unit: "piece", colours: 5 },
  { name: "Sliding door weather strip", category: "sliding", unit: "roll", colours: 3 },
  { name: "Sliding door gasket", category: "sliding", unit: "roll" },
  // Kits
  { name: "Synchro kit", category: "kit", unit: "set" },
  { name: "Telescopic kit", category: "kit", unit: "set", variants: ["T+1", "T+2", "T+3", "T+4"] },
  { name: "Slide-cum-fold kit", category: "kit", unit: "set", variants: ["S+1", "S+2", "S+3", "S+4", "S+5"] },
  { name: "Bifold pooja kit", category: "kit", unit: "set", colours: 3 },
  // Hardware
  { name: "Screws", category: "hardware", unit: "box", colours: 9 },
  { name: "20mm profile hinges", category: "hardware", unit: "piece", colours: 3 },
  { name: "Profile door locks", category: "hardware", unit: "piece", colours: 3 },
  { name: "Air hinge", category: "hardware", unit: "piece" },
  { name: "Pin hinges", category: "hardware", unit: "piece" },
  { name: "Profile connectors", category: "hardware", unit: "piece" },
  { name: "Profile door 5mm gasket", category: "hardware", unit: "roll" },
  { name: "Butterfly", category: "hardware", unit: "piece" },
  { name: "Rod", category: "hardware", unit: "piece" },
  // Glass and consumables (mentioned by the client; not on the handwritten list)
  { name: "Glass", category: "glass", unit: "sqft", variants: GLASS_TYPES.filter(([, g]) => g !== "none").map(([n]) => n) },
  { name: "Silicone", category: "consumable", unit: "tube" },
  { name: "Screens", category: "consumable", unit: "piece" },
];

export const WALK_IN_CODE = "WALK-IN";

export async function seedReferenceData(db: Db): Promise<void> {
  const [catalog] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(catalogOptions);
  if (!catalog?.n) {
    await db.transaction(async (tx) => {
      let sort = 0;
      for (const ot of ORDER_TYPES) {
        const [row] = await tx.insert(catalogOptions).values({ kind: "order_type", name: ot.name, family: ot.family, sort: sort++ }).returning();
        await tx.insert(catalogOptions).values(ot.handles.map((h, i) => ({ kind: "handle_type" as const, name: h, sort: i, orderTypeId: row!.id })));
      }
      const simple = (kind: "frame_type" | "frame_colour" | "handle_position" | "divider", names: string[]) =>
        tx.insert(catalogOptions).values(names.map((name, i) => ({ kind, name, sort: i })));
      await simple("frame_type", FRAME_TYPES);
      await simple("frame_colour", FRAME_COLOURS);
      await simple("handle_position", HANDLE_POSITIONS);
      await simple("divider", DIVIDERS);
      await tx.insert(catalogOptions).values(GLASS_TYPES.map(([name, glassGroup], i) => ({ kind: "glass_type" as const, name, glassGroup, sort: i })));
    });
  }

  const [stock] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(inventoryItems);
  if (!stock?.n) {
    await db.transaction(async (tx) => {
      for (const [i, s] of INVENTORY.entries()) {
        const [item] = await tx
          .insert(inventoryItems)
          .values({ name: s.name, category: s.category, unit: s.unit, colourCount: s.colours ?? null, sort: i })
          .returning();
        // Items without colours get their stock line(s) now; coloured items get theirs as admins add
        // each colour (the client hasn't named the colours per item yet).
        const variants = s.variants ?? (s.colours ? [] : ["Standard"]);
        if (variants.length) await tx.insert(inventoryVariants).values(variants.map((colour) => ({ itemId: item!.id, colour })));
      }
    });
  }

  const [walkIn] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(vendors).where(sql`${vendors.isWalkIn}`);
  if (!walkIn?.n) {
    await db.insert(vendors).values({
      code: WALK_IN_CODE,
      firmName: "Direct customer (walk-in)",
      isWalkIn: true,
      pricingModel: "sqft",
      paymentTerms: "before_delivery",
      remarks: "Used for walk-in and direct customers. Priced from the default price list.",
    });
  }
}
