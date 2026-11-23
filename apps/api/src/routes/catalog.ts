import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { catalogOptions, getDb, type CatalogOption } from "@vawe/db";
import { catalogCreateSchema, catalogUpdateSchema, companySchema, ratesSchema, type Catalog, type CatalogItem } from "@vawe/shared";
import { fail, idParam, readBody } from "../lib/http";
import { getCompany, getDefaultRates, putSetting, SETTING_COMPANY, SETTING_DEFAULT_RATES } from "../lib/settings";
import { requireSettingsEdit } from "../middleware/auth";
import type { AppEnv } from "../types";

// The catalogue (order types, frames, glass…: the workbook's Mapping sheet) and app settings. Everyone
// signed in reads them (order forms need them); only admins change them.
export const catalogRoutes = new Hono<AppEnv>();

const item = (o: CatalogOption): CatalogItem => ({ id: o.id, name: o.name, isActive: o.isActive, sort: o.sort });

export async function loadCatalog(): Promise<Catalog> {
  const db = await getDb();
  const rows = await db.select().from(catalogOptions).orderBy(asc(catalogOptions.sort), asc(catalogOptions.name));
  const of = (kind: CatalogOption["kind"]) => rows.filter((r) => r.kind === kind);
  return {
    orderTypes: of("order_type").map((o) => ({
      ...item(o),
      family: o.family ?? "sliding",
      handleTypes: rows.filter((h) => h.kind === "handle_type" && h.orderTypeId === o.id).map(item),
    })),
    frameTypes: of("frame_type").map(item),
    frameColours: of("frame_colour").map(item),
    glassTypes: of("glass_type").map((g) => ({ ...item(g), glassGroup: g.glassGroup ?? "regular" })),
    handlePositions: of("handle_position").map(item),
    dividers: of("divider").map(item),
  };
}

catalogRoutes.get("/catalog", async (c) => c.json(await loadCatalog()));

catalogRoutes.post("/catalog", requireSettingsEdit, async (c) => {
  const input = await readBody(c, catalogCreateSchema);
  if (input.kind === "order_type" && !input.family) fail(400, "Choose how this order type is priced", { field: "family" });
  if (input.kind === "glass_type" && !input.glassGroup) fail(400, "Choose which rate this glass uses", { field: "glassGroup" });
  if (input.kind === "handle_type" && !input.orderTypeId) fail(400, "Choose the order type this handle belongs to", { field: "orderTypeId" });
  const db = await getDb();
  const siblings = await db
    .select({ name: catalogOptions.name, sort: catalogOptions.sort })
    .from(catalogOptions)
    .where(input.kind === "handle_type" ? and(eq(catalogOptions.kind, input.kind), eq(catalogOptions.orderTypeId, input.orderTypeId!)) : eq(catalogOptions.kind, input.kind));
  if (siblings.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) fail(409, "That option already exists", { field: "name" });
  const [row] = await db
    .insert(catalogOptions)
    .values({
      kind: input.kind,
      name: input.name,
      family: input.kind === "order_type" ? input.family : null,
      glassGroup: input.kind === "glass_type" ? input.glassGroup : null,
      orderTypeId: input.kind === "handle_type" ? input.orderTypeId : null,
      sort: Math.max(-1, ...siblings.map((s) => s.sort)) + 1,
    })
    .returning();
  return c.json(row, 201);
});

catalogRoutes.patch("/catalog/:id", requireSettingsEdit, async (c) => {
  const id = idParam(c);
  const input = await readBody(c, catalogUpdateSchema);
  const db = await getDb();
  const [row] = await db.update(catalogOptions).set(input).where(eq(catalogOptions.id, id)).returning();
  if (!row) fail(404, "Option not found");
  return c.json(row);
});

// ---------- Settings ----------

catalogRoutes.get("/settings/rates", async (c) => c.json(await getDefaultRates(await getDb())));

catalogRoutes.put("/settings/rates", requireSettingsEdit, async (c) => {
  const rates = await readBody(c, ratesSchema);
  await putSetting(await getDb(), SETTING_DEFAULT_RATES, rates, c.get("user").id);
  return c.json(rates);
});

catalogRoutes.get("/settings/company", async (c) => c.json(await getCompany(await getDb())));

catalogRoutes.put("/settings/company", requireSettingsEdit, async (c) => {
  const company = await readBody(c, companySchema);
  await putSetting(await getDb(), SETTING_COMPANY, company, c.get("user").id);
  return c.json(company);
});
