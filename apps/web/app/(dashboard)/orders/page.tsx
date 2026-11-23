import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { canEdit, canView, STAGE_FLOW, STAGE_LABELS, type OrderBoard, type OrderInsights, type OrderListItem } from "@vawe/shared";
import { CountUp } from "@/components/charts";
import { LoadError, NoAccess } from "@/components/no-access";
import { OrderTable } from "@/components/orders/order-bits";
import { OrdersOverview } from "@/components/orders/orders-overview";
import { PageHeader } from "@/components/ui";
import { cx } from "@/lib/cx";
import { PendingFrame, Tabs, UrlStateProvider } from "@/components/url-state";
import { VendorSearch } from "@/components/vendors/vendor-search";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Orders" };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "active", label: "Active" },
  { value: "pre", label: "Before production" },
  { value: "production", label: "In production" },
  { value: "hold", label: "On hold" },
  { value: "done", label: "Dispatched & delivered" },
  { value: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; stage?: string }> }) {
  const me = await requireMe();
  if (!canView(me, "order")) return <NoAccess module="order" />;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "overview";
  const header = (
    <PageHeader title="Orders" description="Every order from design to delivery.">
      {canEdit(me, "order") && (
        <Link href="/orders/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-solid px-4 text-sm font-medium text-on-solid shadow-sm hover:bg-solid/85">
          <Plus size={17} /> New order
        </Link>
      )}
    </PageHeader>
  );

  if (tab === "overview") {
    const insights = await apiGet<OrderInsights>("/v1/orders/insights");
    return (
      <UrlStateProvider>
        {header}
        <Tabs tabs={TABS} value={tab} />
        {insights.ok ? <OrdersOverview d={insights.data} /> : <LoadError message={insights.error.error} />}
      </UrlStateProvider>
    );
  }

  const qs = new URLSearchParams();
  if (tab === "hold") qs.set("hold", "1");
  else if (tab !== "all") qs.set("phase", tab);
  if (sp.q) qs.set("q", sp.q);
  if (sp.stage) qs.set("stage", sp.stage);
  const [orders, board] = await Promise.all([apiGet<OrderListItem[]>(`/v1/orders?${qs}`), apiGet<OrderBoard>("/v1/orders/board")]);
  if (!orders.ok) return <LoadError message={orders.error.error} />;

  return (
    <UrlStateProvider>
      {header}

      {board.ok && <Pipeline board={board.data} activeStage={sp.stage} />}

      <Tabs tabs={TABS} value={tab} />
      <div className="mb-4">
        <VendorSearch initial={sp.q ?? ""} placeholder="Search by order code, vendor, customer, project or location" />
      </div>
      <PendingFrame>
        {sp.stage && (
          <p className="mb-3 text-sm text-ink-2">
            Showing <span className="font-medium">{STAGE_LABELS[sp.stage as keyof typeof STAGE_LABELS] ?? sp.stage}</span> ·{" "}
            <Link href="/orders?tab=active" className="text-brand hover:underline">
              Clear
            </Link>
          </p>
        )}
        <OrderTable orders={orders.data} empty={sp.q ? "No orders match." : "No orders here yet."} />
      </PendingFrame>
    </UrlStateProvider>
  );
}

/** How many orders sit at each stage: tap one to see them. */
function Pipeline({ board, activeStage }: { board: OrderBoard; activeStage?: string }) {
  const stages = STAGE_FLOW.filter((s) => s !== "delivered");
  const max = Math.max(1, ...stages.map((s) => board.counts[s]));
  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Where orders are</h2>
        <p className="text-[13px] text-ink-3">
          {board.onHold > 0 && <span className="font-medium text-warn">{board.onHold} on hold · </span>}
          {board.overdueDelivery > 0 && <span className="font-medium text-bad">{board.overdueDelivery} past expected delivery · </span>}
          {board.counts.delivered} delivered
        </p>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {stages.map((s, i) => {
          const n = board.counts[s];
          return (
            <Link
              key={s}
              href={activeStage === s ? "/orders?tab=active" : `/orders?tab=all&stage=${s}`}
              title={STAGE_LABELS[s]}
              className={cx(
                "group flex min-w-[74px] flex-1 flex-col justify-end rounded-xl p-2 transition-colors",
                activeStage === s ? "bg-brand-soft" : "hover:bg-surface-2",
              )}
            >
              <div className="flex h-16 items-end">
                <div
                  style={{ height: `${Math.max(n ? 14 : 4, (n / max) * 100)}%`, animationDelay: `${i * 40}ms` }}
                  className={cx("animate-rise w-full rounded-t-md rounded-b-sm transition-all", n ? "bg-chart-1" : "bg-surface-2", i < 5 && n > 0 && "opacity-55")}
                />
              </div>
              <CountUp value={n} className="mt-1.5 text-lg font-semibold tabular-nums" />
              <span className="line-clamp-2 text-[11px] leading-tight text-ink-3 group-hover:text-ink-2">{STAGE_LABELS[s].replace("Awaiting ", "")}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
