import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  canEdit,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  UNIT_LABELS,
  type Catalog,
  type InventoryItemView,
  type InventoryUsage,
  type MovementView,
} from "@vawe/shared";
import { BarList, ChartCard, ColumnChart, StatTile } from "@/components/charts";
import { AddColour, AddItem, MoveStock } from "@/components/inventory/inventory-forms";
import { LoadError } from "@/components/no-access";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PendingFrame, Tabs, UrlStateProvider } from "@/components/url-state";
import { VendorSearch } from "@/components/vendors/vendor-search";
import { cx } from "@/lib/cx";
import { dayLabel, monthLabel, monthLong } from "@/lib/dates";
import { dateTime, number } from "@/lib/format";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Inventory" };

const TABS = [
  { value: "stock", label: "Stock" },
  { value: "usage", label: "Usage" },
  { value: "movements", label: "Movements" },
];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; cat?: string; q?: string; low?: string }> }) {
  const me = await requireMe();
  // Everyone may view inventory; changing it needs an admin with Inventory: edit.
  const isAdmin = canEdit(me, "inventory");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "stock";

  let body: React.ReactNode;
  if (tab === "stock") {
    const [inv, catalog] = await Promise.all([apiGet<InventoryItemView[]>("/v1/inventory"), apiGet<Catalog>("/v1/catalog")]);
    if (!inv.ok) return <LoadError message={inv.error.error} />;
    const colours = catalog.ok ? catalog.data.frameColours.filter((c) => c.name !== "No Profile Only Glass").map((c) => c.name) : [];
    const lines = inv.data.flatMap((i) => i.variants.filter((v) => v.isActive));
    const low = lines.filter((v) => v.low);
    const value = lines.reduce((s, v) => s + (v.unitCost ?? 0) * v.stock, 0);
    const q = sp.q?.trim().toLowerCase();
    const items = inv.data.filter(
      (i) =>
        i.isActive &&
        (!sp.cat || i.category === sp.cat) &&
        (!q || i.name.toLowerCase().includes(q) || i.variants.some((v) => v.colour.toLowerCase().includes(q))) &&
        (sp.low !== "1" || i.variants.some((v) => v.low)),
    );
    body = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Items" value={inv.data.filter((i) => i.isActive).length} hint={`${lines.length} stock lines (item × colour)`} />
          <StatTile label="Low stock" value={low.length} tone="warn" hint="At or below the reorder level" delay={60} />
          <StatTile label="Stock value" value={value} format="moneyShort" hint="Where a unit cost is set" delay={120} />
          <StatTile label="Colours still to add" value={inv.data.reduce((s, i) => s + Math.max(0, (i.colourCount ?? 0) - i.variants.length), 0)} hint="From the client's IMS list" delay={180} />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <VendorSearch initial={sp.q ?? ""} placeholder="Search item or colour" />
          <div className="flex flex-wrap gap-1.5">
            <Chip href={qs(sp, { cat: null })} active={!sp.cat}>
              All
            </Chip>
            {INVENTORY_CATEGORIES.map((c) => (
              <Chip key={c} href={qs(sp, { cat: c })} active={sp.cat === c}>
                {INVENTORY_CATEGORY_LABELS[c]}
              </Chip>
            ))}
            <Chip href={qs(sp, { low: sp.low === "1" ? null : "1" })} active={sp.low === "1"}>
              <AlertTriangle size={12} className="mr-1 inline" /> Low only
            </Chip>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {items.length === 0 && <Card className="p-8 text-center text-sm text-ink-3 xl:col-span-2">Nothing matches.</Card>}
          {items.map((item, i) => {
            const missing = Math.max(0, (item.colourCount ?? 0) - item.variants.length);
            const active = item.variants.filter((v) => v.isActive);
            const maxStock = Math.max(1, ...active.map((v) => Math.max(v.stock, v.reorderLevel * 2)));
            return (
              <Card key={item.id} className="animate-rise overflow-hidden" >
                <div style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-[12.5px] text-ink-3">
                      {INVENTORY_CATEGORY_LABELS[item.category]} · counted in {UNIT_LABELS[item.unit]}
                      {item.colourCount ? ` · ${item.variants.length} of ${item.colourCount} colours` : ""}
                    </p>
                  </div>
                  {isAdmin && (item.colourCount || item.variants.length === 0) ? <AddColour item={item} suggestions={colours} /> : missing > 0 ? <Badge tone="warn">{missing} colours to add</Badge> : null}
                </div>
                {active.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-ink-3">{isAdmin ? "Add each colour this item comes in to start tracking stock." : "Not tracked yet."}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {active.map((v) => (
                      <li key={v.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {v.colour}
                            {v.low && <Badge tone="warn">Low</Badge>}
                          </p>
                          <p className="text-[12px] text-ink-3">
                            {v.daysLeft !== null ? `~${v.daysLeft} days left` : v.usedLast30 ? "" : "No use in 30 days"}
                            {v.reorderLevel > 0 && ` · reorder at ${number(v.reorderLevel, 2)}`}
                          </p>
                        </div>
                        <div className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2" title={`${v.stock} in stock`}>
                            <div className={cx("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700", v.low ? "bg-warn" : "bg-chart-1")} style={{ width: `${Math.min(100, (v.stock / maxStock) * 100)}%` }} />
                            {v.reorderLevel > 0 && <div aria-hidden className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${Math.min(100, (v.reorderLevel / maxStock) * 100)}%` }} />}
                          </div>
                          <span className="w-20 text-right text-sm font-semibold tabular-nums">
                            {number(v.stock, 2)} <span className="text-[11px] font-normal text-ink-3">{UNIT_LABELS[item.unit]}</span>
                          </span>
                        </div>
                        {isAdmin ? <MoveStock item={item} variant={v} /> : <span />}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
        {!isAdmin && <p className="text-[13px] text-ink-3">View only. Stock is changed by admins with Inventory edit access.</p>}
      </div>
    );
  } else if (tab === "usage") {
    const res = await apiGet<InventoryUsage>("/v1/inventory/usage?months=4");
    if (!res.ok) return <LoadError message={res.error.error} />;
    const u = res.data;
    const last = u.months.length - 1;
    body = (
      <div className="space-y-5">
        <p className="text-sm text-ink-2">
          Stock taken out each month: the last 3 months against {monthLong(u.months[last]!)} so far. Each item is in its own unit.
        </p>
        {u.topItems.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-3">No stock has been taken out yet. Usage appears here once stock-outs are recorded.</Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {u.topItems.slice(0, 9).map((it) => {
                const prevAvg = it.values.slice(0, last).reduce((s, v) => s + v, 0) / Math.max(1, last);
                const now = it.values[last]!;
                const change = prevAvg > 0 ? Math.round(((now - prevAvg) / prevAvg) * 100) : null;
                return (
                  <ChartCard key={it.itemId} title={it.name} subtitle={`${UNIT_LABELS[it.unit]} used per month`} action={change !== null ? <Badge tone={change > 0 ? "brand" : "neutral"}>{change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}% vs avg</Badge> : undefined}>
                    <ColumnChart height={150} data={it.values.map((v, i) => ({ label: monthLabel(u.months[i]!), value: v, highlight: i === last, tooltip: `${monthLong(u.months[i]!)} · ${UNIT_LABELS[it.unit]}` }))} valueFormat="decimal" />
                  </ChartCard>
                );
              })}
            </div>
            <ChartCard
              title="Usage compared"
              subtitle="Every item used in the last 4 months"
              table={{ columns: ["Item", ...u.months.map(monthLabel)], rows: u.topItems.map((it) => [it.name, ...it.values.map((v) => `${number(v, 2)} ${UNIT_LABELS[it.unit]}`)]) }}
            >
              <BarList rows={u.topItems.map((it) => ({ label: it.name, value: it.values[last]!, sub: `${u.months.slice(0, last).map((m, i) => `${monthLabel(m)}: ${number(it.values[i]!, 1)}`).join(" · ")}` }))} format="decimal" />
            </ChartCard>
          </>
        )}
      </div>
    );
  } else {
    const res = await apiGet<MovementView[]>("/v1/inventory/movements");
    if (!res.ok) return <LoadError message={res.error.error} />;
    body = (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium sm:px-5">Date</th>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">What</th>
                <th className="px-3 py-2.5 text-right font-medium">Change</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {res.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink-3">
                    No stock movements yet.
                  </td>
                </tr>
              )}
              {res.data.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 text-ink-2 sm:px-5" title={dateTime(m.createdAt)}>
                    {dayLabel(m.movedOn)}
                  </td>
                  <td className="px-3 py-2.5">
                    {m.itemName} <span className="text-ink-3">· {m.colour}</span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">
                    {m.kind === "in" ? "Stock in" : m.kind === "out" ? "Stock out" : "Recount"}
                    {m.orderCode && ` · ${m.orderCode}`}
                    {m.reason && ` · ${m.reason}`}
                    {m.userName && <span className="text-ink-3"> · {m.userName}</span>}
                  </td>
                  <td className={cx("px-3 py-2.5 text-right font-medium tabular-nums", m.quantity > 0 ? "text-good" : "text-bad")}>
                    {m.quantity > 0 ? "+" : ""}
                    {number(m.quantity, 2)} {UNIT_LABELS[m.unit]}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">{number(m.balanceAfter, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <UrlStateProvider>
      <PageHeader title="Inventory" description={isAdmin ? "Stock by item and colour. You can add items and move stock." : "Stock by item and colour. View only."}>
        {isAdmin && tab === "stock" && <AddItem />}
      </PageHeader>
      <Tabs tabs={TABS} value={tab} />
      <PendingFrame>{body}</PendingFrame>
    </UrlStateProvider>
  );
}

function qs(sp: Record<string, string | undefined>, patch: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return `/inventory${s ? `?${s}` : ""}`;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={cx("rounded-full border px-3 py-1 text-[13px]", active ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
      {children}
    </Link>
  );
}
