import { accessFor, type Me, type Module } from "@vawe/shared";
import { Badge } from "./ui";

/** One line per module, for the Overview cards. */
export const MODULE_PLAN: Record<Module, { description: string }> = {
  sales: { description: "How many orders, how much value, which products sell and where orders come from." },
  vendor: { description: "Every B2B vendor, their prices, how they pay and who to follow up with." },
  order: { description: "Create orders with their items and follow each one from design to dispatch." },
  finance: { description: "Money in, money owed and what each order and day costs." },
  inventory: { description: "Stock on hand, usage and what to reorder. Everyone can view; only admins update stock." },
};

export function AccessBadge({ me, module }: { me: Me; module: Module }) {
  const level = accessFor(me, module);
  if (level === "edit") return <Badge tone="good">Can edit</Badge>;
  if (level === "view") return <Badge tone="neutral">View only</Badge>;
  return <Badge tone="bad">No access</Badge>;
}
