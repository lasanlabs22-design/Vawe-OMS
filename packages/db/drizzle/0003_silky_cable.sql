CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"gstin" text,
	"supplies" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_idx" ON "suppliers" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" USING btree ("supplier_id");--> statement-breakpoint

-- Supplier list from the names already on purchases, then link each purchase to its supplier.
INSERT INTO "suppliers" ("name")
SELECT DISTINCT ON (lower(trim("supplier_name"))) trim("supplier_name") FROM "purchases"
WHERE trim("supplier_name") <> '' ORDER BY lower(trim("supplier_name")), "created_at";--> statement-breakpoint
UPDATE "purchases" p SET "supplier_id" = s."id" FROM "suppliers" s WHERE lower(trim(p."supplier_name")) = lower(s."name");--> statement-breakpoint

-- IMS items as in the client's typed requirements PDF (new databases get these from the seed).
UPDATE "inventory_items" SET "name" = '21mm pin hinge profile' WHERE "name" = '25mm pin hinge profile';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = '55mm pasting profile (single slot)' WHERE "name" = '55mm pasting profile (S.S)';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = '55mm pasting profile (double slot)' WHERE "name" = '55mm pasting profile (D.S)';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = '20mm CNC high handle' WHERE "name" = '20mm CNC hockey handle';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = '20mm vertical handle' WHERE "name" = '20mm vertical concealed handle';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = '20mm horizontal handle' WHERE "name" = '20mm horizontal concealed handle';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = 'Leather handle' WHERE "name" = 'Leather handles';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = 'Bi-fold pooja' WHERE "name" = 'Bifold pooja kit';--> statement-breakpoint
UPDATE "inventory_items" SET "name" = 'Pin hinge' WHERE "name" = 'Pin hinges';--> statement-breakpoint
UPDATE "inventory_items" SET "colour_count" = 5 WHERE "name" = '20mm dividers' AND "colour_count" = 3;--> statement-breakpoint

-- One sliding door kit item with 2/3/4-door lines becomes three items in 3 colours each.
INSERT INTO "inventory_items" ("name", "category", "unit", "colour_count", "sort")
SELECT v."name", 'sliding'::"inventory_category", 'set'::"inventory_unit", 3, k."sort"
FROM "inventory_items" k CROSS JOIN (VALUES ('Sliding door 2-door kit'), ('Sliding door 3-door kit'), ('Sliding door 4-door kit')) AS v("name")
WHERE k."name" = 'Sliding door kit';--> statement-breakpoint
-- The old item goes if it was never used; otherwise it's hidden and keeps its stock history.
DELETE FROM "inventory_items" k WHERE k."name" = 'Sliding door kit' AND NOT EXISTS (
  SELECT 1 FROM "stock_movements" m JOIN "inventory_variants" iv ON iv."id" = m."variant_id" WHERE iv."item_id" = k."id"
);--> statement-breakpoint
UPDATE "inventory_items" SET "is_active" = false, "notes" = 'Replaced by the 2-door, 3-door and 4-door kits (one item each, in 3 colours).' WHERE "name" = 'Sliding door kit';