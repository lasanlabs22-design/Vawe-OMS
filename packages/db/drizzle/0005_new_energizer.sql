-- Handle colour per order item. Existing items take their frame colour, then the column is required.
ALTER TABLE "order_items" ADD COLUMN "handle_colour" text;--> statement-breakpoint
UPDATE "order_items" SET "handle_colour" = "frame_colour";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "handle_colour" SET NOT NULL;
