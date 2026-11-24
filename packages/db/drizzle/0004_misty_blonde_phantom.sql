-- Order stages as in the client's requirements PDF: adds "in production" and "route planning", and
-- moves glass cutting after profile cutting. Every existing stage value is kept, so no order changes
-- stage. The type is rebuilt to put the values in the new order.
ALTER TABLE "orders" ALTER COLUMN "stage" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "from_stage" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "to_stage" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "stage" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."order_stage";--> statement-breakpoint
CREATE TYPE "public"."order_stage" AS ENUM('design', 'qa', 'dwg_confirmation', 'estimate_confirmation', 'awaiting_payment', 'in_production', 'cutting', 'glass_cutting', 'drilling', 'hinge_holes', 'assembly', 'packaging', 'route_planning', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "from_stage" SET DATA TYPE "public"."order_stage" USING "from_stage"::"public"."order_stage";--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "to_stage" SET DATA TYPE "public"."order_stage" USING "to_stage"::"public"."order_stage";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "stage" SET DATA TYPE "public"."order_stage" USING "stage"::"public"."order_stage";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "stage" SET DEFAULT 'design';
