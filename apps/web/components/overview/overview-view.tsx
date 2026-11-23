"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes, CalendarDays, Clock3, Factory, Handshake, PieChart, TrendingUp, Wallet } from "lucide-react";
import { STAGE_LABELS, UNIT_LABELS, type InventoryUnit, type OrderStage } from "@vawe/shared";
import { CountUp } from "../charts";
import { MonthHero } from "../sales/month-hero";
import { BulletList, CalendarHeatmap, Donut, Ring, SegmentedBar, StageFlow, VizCard, Waffle } from "../viz";
import { moneyShort } from "@/lib/format";

export interface OverviewData {
  orders?: {
    active: number;
    onHold: number;
    lateDeliveries: number;
    phases: { pre: number; production: number; dispatched: number };
    stages: { stage: OrderStage; count: number }[];
    activity: { date: string; count: number }[];
  };
  sales?: { monthOrders: number; monthValue: number; lastMonthToDate: number; lastMonthTotal: number; daily: { date: string; value: number }[] };
  finance?: { receivable: number; overdue: number; collectedThisMonth: number; aging: { label: string; amount: number }[] };
  vendor?: { openFollowups: number; health: { good: number; watch: number; at_risk: number; new: number }; tiles: { name: string; health: "good" | "watch" | "at_risk" | "new" }[] };
  inventory: { lines: { ok: number; low: number; out: number }; lowest: { name: string; colour: string; stock: number; reorderLevel: number; unit: string }[] };
}

// Order phases keep the same colour wherever they appear (the donut and the production flow).
const PHASE = {
  pre: { label: "Before production", color: "var(--chart-1)" },
  production: { label: "In production", color: "var(--chart-2)" },
  dispatched: { label: "Dispatched", color: "var(--chart-3)" },
} as const;
const PRE = ["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"];

// Status colours always come with their names.
const HEALTH_COLOR = { good: "var(--good)", watch: "var(--warn)", at_risk: "var(--bad)", new: "var(--line)" } as const;
const HEALTH_LABEL = { good: "Paying on time", watch: "Watch", at_risk: "At risk", new: "Nothing due yet" } as const;
const AGING_COLORS = ["var(--good)", "var(--warn)", "color-mix(in oklab, var(--bad) 70%, var(--surface))", "var(--bad)"];

function More({ href, label = "Open" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft">
      {label} <ArrowUpRight size={13} />
    </Link>
  );
}

export function OverviewView({ data }: { data: OverviewData }) {
  const { orders, sales, finance, vendor, inventory } = data;
  const collectedShare = finance ? finance.collectedThisMonth / Math.max(1, finance.collectedThisMonth + finance.receivable) : 0;
  const lineTotal = inventory.lines.ok + inventory.lines.low + inventory.lines.out;

  return (
    <div className="grid gap-5 lg:grid-cols-6">
      {sales && (
        <VizCard icon={TrendingUp} tone="var(--chart-1)" title="Sales this month" subtitle="Order value before GST" className="lg:col-span-4" action={<More href="/sales" />}>
          <MonthHero
            value={sales.monthValue}
            orders={sales.monthOrders}
            before={sales.lastMonthToDate}
            lastMonthTotal={sales.lastMonthTotal}
            daily={sales.daily}
            caption="Order value per day, last 30 days"
          />
        </VizCard>
      )}

      {orders && (
        <VizCard icon={PieChart} tone="var(--chart-4)" title="Where orders are" subtitle={`${orders.active} in progress${orders.onHold ? ` · ${orders.onHold} on hold` : ""}`} className="lg:col-span-2" action={<More href="/orders" />}>
          <Donut
            size={150}
            stacked
            slices={(["pre", "production", "dispatched"] as const).map((k) => ({ label: PHASE[k].label, value: orders.phases[k], color: PHASE[k].color }))}
            center={{ value: String(orders.active), label: "in progress" }}
          />
        </VizCard>
      )}

      {orders && (
        <VizCard
          icon={Factory}
          tone="var(--chart-2)"
          title="Production flow"
          subtitle="Orders waiting at each stage. Tap a stage to see them."
          className="lg:col-span-4"
          action={orders.lateDeliveries ? <span className="rounded-full bg-bad-soft px-2.5 py-1 text-[12px] font-medium text-bad">{orders.lateDeliveries} past expected delivery</span> : undefined}
        >
          <StageFlow
            stages={orders.stages.map((s) => ({
              label: STAGE_LABELS[s.stage].replace("Awaiting ", "").replace(" confirmation", ""),
              count: s.count,
              href: `/orders?tab=all&stage=${s.stage}`,
              color: PRE.includes(s.stage) ? PHASE.pre.color : s.stage === "dispatched" ? PHASE.dispatched.color : PHASE.production.color,
            }))}
            groups={[
              { label: "Before production", span: 5, color: PHASE.pre.color },
              { label: "Production route", span: 6, color: PHASE.production.color },
              { label: "Out", span: 1, color: PHASE.dispatched.color },
            ]}
          />
        </VizCard>
      )}

      {finance && (
        <VizCard icon={Wallet} tone="var(--good)" title="Collected this month" subtitle="Against everything still owed" className="lg:col-span-2" action={<More href="/finance" />}>
          <div className="flex items-center gap-4">
            <Ring ratio={collectedShare} value={moneyShort(finance.collectedThisMonth)} label="collected" color="var(--good)" />
            <div className="min-w-0 space-y-2 text-[13px]">
              <p>
                <span className="text-ink-3">Still owed</span>
                <br />
                <span className="text-lg font-semibold">{moneyShort(finance.receivable)}</span>
              </p>
              {finance.overdue > 0 && (
                <p className="text-bad">
                  {moneyShort(finance.overdue)} <span className="text-ink-3">overdue</span>
                </p>
              )}
            </div>
          </div>
        </VizCard>
      )}

      {orders && (
        <VizCard icon={CalendarDays} tone="var(--chart-4)" title="Order activity" subtitle="New orders per day, last 12 weeks" className="lg:col-span-3">
          <CalendarHeatmap days={orders.activity} label="orders" color="var(--chart-4)" />
        </VizCard>
      )}

      {finance && (
        <VizCard icon={Clock3} tone="var(--bad)" title="Money owed, by age" subtitle="How late the open balances are" className="lg:col-span-3" action={<More href="/finance?tab=receivables" />}>
          <p className="mb-4">
            <CountUp value={finance.receivable} format="moneyShort" className="text-[1.9rem] leading-none font-semibold tracking-tight tabular-nums" />
            <span className="ml-2 text-[13px] text-ink-3">owed to Vawe</span>
          </p>
          <SegmentedBar parts={finance.aging.map((a, i) => ({ label: a.label, value: a.amount, color: AGING_COLORS[i]! }))} format={moneyShort} />
        </VizCard>
      )}

      {vendor && (
        <VizCard
          icon={Handshake}
          tone="var(--chart-3)"
          title="Vendor payment health"
          subtitle="One square per vendor"
          className="lg:col-span-3"
          action={<More href="/vendors?tab=attention" label={vendor.openFollowups ? `${vendor.openFollowups} follow-ups` : "Open"} />}
        >
          <Waffle
            tiles={vendor.tiles.map((t) => ({ label: `${t.name}: ${HEALTH_LABEL[t.health]}`, color: HEALTH_COLOR[t.health] }))}
            legend={(["at_risk", "watch", "good", "new"] as const).map((h) => ({ label: HEALTH_LABEL[h], color: HEALTH_COLOR[h], count: vendor.health[h] }))}
          />
        </VizCard>
      )}

      <VizCard icon={Boxes} tone="var(--chart-2)" title="Stock levels" subtitle={lineTotal ? `${lineTotal} stock lines tracked` : "Add colours and stock in Inventory"} className="lg:col-span-3" action={<More href="/inventory" />}>
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <Donut
            size={128}
            thickness={16}
            slices={[
              { label: "OK", value: inventory.lines.ok, color: "var(--good)" },
              { label: "Low", value: inventory.lines.low, color: "var(--warn)" },
              { label: "Out", value: inventory.lines.out, color: "var(--bad)" },
            ]}
            center={{ value: String(inventory.lines.low + inventory.lines.out), label: "to reorder" }}
          />
          <div className="min-w-0">
            <p className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Closest to running out</p>
            <BulletList
              color="var(--chart-3)"
              rows={inventory.lowest.map((l) => ({ label: l.name, sub: l.colour === "Standard" ? undefined : l.colour, value: l.stock, target: l.reorderLevel, unit: UNIT_LABELS[l.unit as InventoryUnit] ?? l.unit }))}
            />
          </div>
        </div>
      </VizCard>
    </div>
  );
}
