import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, UserRound } from "lucide-react";
import { accessFor } from "@vawe/shared";
import { StatTile } from "@/components/charts";
import { AccessBadge, MODULE_PLAN } from "@/components/module-page";
import { Card } from "@/components/ui";
import { MODULE_NAV } from "@/lib/modules";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Overview" };

interface OverviewData {
  orders?: { active: number; inProduction: number; onHold: number; lateDeliveries: number };
  sales?: { monthOrders: number; monthValue: number };
  finance?: { receivable: number; overdue: number };
  vendor?: { openFollowups: number };
  inventory: { lowStock: number };
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const me = await requireMe();
  const modules = MODULE_NAV.filter((n) => n.module && accessFor(me, n.module) !== "none");
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  const profileIncomplete = !me.phone || !me.bloodGroup || !me.emergencyPhone || !me.photoUrl;
  const res = await apiGet<OverviewData>("/v1/overview");
  const d = res.ok ? res.data : null;

  const tiles: React.ReactNode[] = [];
  if (d?.orders) {
    tiles.push(<StatTile key="active" label="Orders in progress" value={d.orders.active} hint={`${d.orders.inProduction} in production`} />);
    tiles.push(<StatTile key="hold" label="On hold" value={d.orders.onHold} tone="warn" hint="Waiting for materials" />);
  }
  if (d?.sales) tiles.push(<StatTile key="sales" label="Sales this month" value={d.sales.monthValue} format="moneyShort" hint={`${d.sales.monthOrders} orders, before GST`} />);
  if (d?.finance) {
    tiles.push(<StatTile key="recv" label="To be received" value={d.finance.receivable} format="moneyShort" hint="All open orders" />);
    tiles.push(<StatTile key="over" label="Overdue" value={d.finance.overdue} format="moneyShort" tone="bad" hint="Past the due date" />);
  }
  if (d?.orders) tiles.push(<StatTile key="late" label="Past expected delivery" value={d.orders.lateDeliveries} tone="bad" hint="Not yet dispatched" />);
  if (d?.vendor) tiles.push(<StatTile key="fu" label="Vendor follow-ups" value={d.vendor.openFollowups} hint="Open" />);
  if (d) tiles.push(<StatTile key="low" label="Low stock" value={d.inventory.lowStock} tone="warn" hint="Stock lines to reorder" />);

  return (
    <>
      <div className="mb-8">
        <p className="text-sm text-ink-3">{today}</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">
          {greeting()}, {me.name.split(" ")[0]}
        </h1>
      </div>

      {profileIncomplete && (
        <Link href="/settings" className="animate-rise mb-6 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <UserRound size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Complete your profile</p>
            <p className="text-[13px] text-ink-2">Add your photo, phone, blood group and an emergency contact.</p>
          </div>
          <ArrowUpRight size={18} className="shrink-0 text-ink-3" />
        </Link>
      )}

      {tiles.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <div key={i} style={{ animationDelay: `${i * 60}ms` }} className="animate-rise">
              {t}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 font-semibold">Your modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item, i) => {
          const Icon = item.icon;
          const module = item.module!;
          return (
            <Link key={item.href} href={item.href} style={{ animationDelay: `${i * 70}ms` }} className="group animate-rise">
              <Card className="h-full p-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-brand/40 group-hover:shadow-lg group-hover:shadow-brand/5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand transition-transform duration-300 group-hover:scale-105">
                    <Icon size={21} />
                  </span>
                  <AccessBadge me={me} module={module} />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{item.label}</h3>
                <p className="mt-1 text-sm text-ink-2">{MODULE_PLAN[module].description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
