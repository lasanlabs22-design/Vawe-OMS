import { CircleDashed, Eye, Lock, PencilLine } from "lucide-react";
import { accessFor, MODULE_LABELS, type Me, type Module } from "@vawe/shared";
import { Badge, Card, PageHeader } from "./ui";

/** What each module will hold, from the client's brief. Shown until the module is built. */
export const MODULE_PLAN: Record<Module, { description: string; sections: string[] }> = {
  sales: {
    description: "How many orders, how much value, which products sell and where orders come from.",
    sections: [
      "This month: number of orders vs order value",
      "Last 3 months vs this month, with a day-by-day range view",
      "Top products by units and revenue",
      "Product-level sales for every product",
      "Source funnel: walk-in, social media, B2B vendor, offline, reference",
    ],
  },
  vendor: {
    description: "Every B2B vendor, their prices, how they pay and who to follow up with.",
    sections: [
      "Add vendor with auto ID and GSTIN lookup",
      "Primary and secondary contacts, payment terms",
      "Vendor-specific product pricing (SQFT / RFT)",
      "Vendor health: on-time payments",
      "Performance: payment record and purchase trends",
      "Communication list for follow-ups",
    ],
  },
  order: {
    description: "Create orders with their items and follow each one from design to dispatch.",
    sections: [
      "New order: vendor, project, location, project manager",
      "Items with size, frame, glass, handle, divider, hinge holes",
      "Generated DWG drawing and job card (PDF)",
      "Tracking: design, Q/A, confirmations, payment, production",
      "Production route: cutting to packaging, with procurement hold",
    ],
  },
  finance: {
    description: "Money in, money owed and what each order and day costs.",
    sections: [
      "Payments received and payments to be received",
      "Delivered but not yet paid",
      "Order-level porter, delivery and factory expenses",
      "Daily production expense",
      "Order returns and purchases",
    ],
  },
  inventory: {
    description: "Stock on hand, usage and what to reorder. Everyone can view; only admins update stock.",
    sections: [
      "Stock list by item and colour (profiles, handles, kits, hardware…)",
      "Low-stock alerts and days of stock left",
      "Usage compared over the last 3 months",
      "Stock in, stock out and adjustments (admins)",
    ],
  },
};

export function AccessBadge({ me, module }: { me: Me; module: Module }) {
  const level = accessFor(me, module);
  if (level === "edit") return <Badge tone="good">Can edit</Badge>;
  if (level === "view") return <Badge tone="neutral">View only</Badge>;
  return <Badge tone="bad">No access</Badge>;
}

/** The page for a module that isn't built yet: what's coming, and what this person will be able to do. */
export function ModulePage({ me, module }: { me: Me; module: Module }) {
  const level = accessFor(me, module);
  const plan = MODULE_PLAN[module];

  if (level === "none") {
    return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Lock size={22} />
        </span>
        <h1 className="text-lg font-semibold">You don't have access to {MODULE_LABELS[module]}</h1>
        <p className="mt-2 text-sm text-ink-2">Ask an admin to give you access in the ops console.</p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={MODULE_LABELS[module]} description={plan.description}>
        <AccessBadge me={me} module={module} />
      </PageHeader>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <CircleDashed size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Being built</h2>
            <p className="mt-1 text-sm text-ink-2">
              This module is next on the list. Here's what it will include.
              {level === "view" ? " You'll be able to view it." : " You'll be able to view and change it."}
            </p>
          </div>
        </div>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {plan.sections.map((s, i) => (
            <li
              key={s}
              style={{ animationDelay: `${120 + i * 60}ms` }}
              className="animate-rise flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-sm"
            >
              {level === "edit" ? <PencilLine size={16} className="mt-0.5 shrink-0 text-ink-3" /> : <Eye size={16} className="mt-0.5 shrink-0 text-ink-3" />}
              {s}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
