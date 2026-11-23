CREATE TYPE "public"."catalog_kind" AS ENUM('order_type', 'frame_type', 'frame_colour', 'glass_type', 'handle_position', 'handle_type', 'divider');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('porter', 'delivery', 'factory', 'production', 'other');--> statement-breakpoint
CREATE TYPE "public"."followup_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "public"."glass_group" AS ENUM('regular', 'fluted', 'lacquered', 'digital_print', 'laminate_insertion', 'cane', 'laminate_glass', 'none');--> statement-breakpoint
CREATE TYPE "public"."inventory_category" AS ENUM('profile', 'handle', 'sliding', 'kit', 'hardware', 'glass', 'consumable');--> statement-breakpoint
CREATE TYPE "public"."inventory_unit" AS ENUM('piece', 'bar', 'set', 'sqft', 'rft', 'tube', 'box', 'roll', 'kg');--> statement-breakpoint
CREATE TYPE "public"."movement_kind" AS ENUM('in', 'out', 'adjust');--> statement-breakpoint
CREATE TYPE "public"."order_family" AS ENUM('profile_shutter', 'sliding');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('direct_walkin', 'social_media', 'b2b_vendor', 'offline_marketing', 'reference');--> statement-breakpoint
CREATE TYPE "public"."order_stage" AS ENUM('design', 'qa', 'dwg_confirmation', 'estimate_confirmation', 'awaiting_payment', 'cutting', 'drilling', 'hinge_holes', 'glass_cutting', 'assembly', 'packaging', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'upi', 'bank_transfer', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."payment_terms" AS ENUM('advance', 'before_delivery', 'net_15', 'net_30', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('sqft', 'rft');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "catalog_kind" NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"family" "order_family",
	"glass_group" "glass_group",
	"order_type_id" uuid
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "expense_category" NOT NULL,
	"order_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"spent_on" date NOT NULL,
	"description" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "inventory_category" NOT NULL,
	"unit" "inventory_unit" NOT NULL,
	"colour_count" integer,
	"notes" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"colour" text NOT NULL,
	"stock" numeric(12, 2) DEFAULT 0 NOT NULL,
	"reorder_level" numeric(12, 2) DEFAULT 0 NOT NULL,
	"unit_cost" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_stage" "order_stage",
	"to_stage" "order_stage",
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"order_type" text NOT NULL,
	"family" "order_family" NOT NULL,
	"frame_type" text NOT NULL,
	"frame_colour" text NOT NULL,
	"glass_type" text NOT NULL,
	"glass_group" "glass_group" NOT NULL,
	"width_mm" integer NOT NULL,
	"height_mm" integer NOT NULL,
	"handle_position" text NOT NULL,
	"handle_type" text NOT NULL,
	"divider" text NOT NULL,
	"hinge_holes" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sqft" numeric(12, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(12, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"items" text,
	"reason" text NOT NULL,
	"returned_on" date NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"project_name" text,
	"location" text,
	"pm_name" text,
	"pm_phone" text,
	"source" "order_source" NOT NULL,
	"source_detail" text,
	"order_date" date NOT NULL,
	"expected_delivery" date,
	"stage" "order_stage" DEFAULT 'design' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"on_hold" boolean DEFAULT false NOT NULL,
	"hold_reason" text,
	"held_at" timestamp with time zone,
	"subtotal" numeric(12, 2) DEFAULT 0 NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"gst_percent" numeric(5, 2) DEFAULT 18 NOT NULL,
	"gst_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total" numeric(12, 2) DEFAULT 0 NOT NULL,
	"pricing" jsonb,
	"delivered_at" timestamp with time zone,
	"due_date" date,
	"notes" text,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"paid_on" date NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_name" text NOT NULL,
	"invoice_no" text,
	"purchased_on" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"reason" text,
	"order_id" uuid,
	"purchase_id" uuid,
	"user_id" uuid,
	"moved_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"due_date" date,
	"assigned_to" uuid,
	"status" "followup_status" DEFAULT 'open' NOT NULL,
	"outcome" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"firm_name" text NOT NULL,
	"is_walk_in" boolean DEFAULT false NOT NULL,
	"gstin" text,
	"legal_name" text,
	"trade_name" text,
	"address" text,
	"state" text,
	"gst_status" text,
	"gst_checked_at" timestamp with time zone,
	"branches" integer DEFAULT 1 NOT NULL,
	"pricing_model" "pricing_model" DEFAULT 'rft' NOT NULL,
	"rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"delivery_terms" text,
	"payment_terms" "payment_terms" DEFAULT 'before_delivery' NOT NULL,
	"payment_days" integer,
	"payment_note" text,
	"contact1_name" text,
	"contact1_phone" text,
	"contact1_email" text,
	"contact2_name" text,
	"contact2_phone" text,
	"contact2_email" text,
	"remarks" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_options" ADD CONSTRAINT "catalog_options_order_type_id_catalog_options_id_fk" FOREIGN KEY ("order_type_id") REFERENCES "public"."catalog_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_variants" ADD CONSTRAINT "inventory_variants_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_inventory_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."inventory_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followups" ADD CONSTRAINT "vendor_followups_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followups" ADD CONSTRAINT "vendor_followups_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followups" ADD CONSTRAINT "vendor_followups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followups" ADD CONSTRAINT "vendor_followups_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_kind_idx" ON "catalog_options" USING btree ("kind","sort");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("spent_on");--> statement-breakpoint
CREATE INDEX "expenses_order_idx" ON "expenses" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_item_colour_idx" ON "inventory_variants" USING btree ("item_id","colour");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "returns_order_idx" ON "order_returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "returns_date_idx" ON "order_returns" USING btree ("returned_on");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_code_idx" ON "orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "orders_vendor_idx" ON "orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "orders_date_idx" ON "orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "orders_stage_idx" ON "orders" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_vendor_idx" ON "payments" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("paid_on");--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("purchased_on");--> statement-breakpoint
CREATE INDEX "movements_variant_idx" ON "stock_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "movements_date_idx" ON "stock_movements" USING btree ("moved_on");--> statement-breakpoint
CREATE INDEX "followups_vendor_idx" ON "vendor_followups" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "followups_status_idx" ON "vendor_followups" USING btree ("status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_code_idx" ON "vendors" USING btree ("code");--> statement-breakpoint
CREATE INDEX "vendors_name_idx" ON "vendors" USING btree ("firm_name");