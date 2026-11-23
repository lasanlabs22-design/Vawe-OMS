"use client";

import Link from "next/link";
import { CalendarDays, Factory, Hourglass, Layers, PauseCircle, PieChart, Truck } from "lucide-react";
import { STAGE_LABELS, type OrderInsights } from "@vawe/shared";
import { BarList } from "../charts";
import { CalendarHeatmap, Donut, RadialBars, Ring, StageFlow, VizCard } from "../viz";

// The Orders overview as pictures. Phases keep the same colours as on the main Overview.

const PHASE = {
  pre: { label: "Before production", color: "var(--chart-1)" },
  production: { label: "In production", color: "var(--chart-2)" },
  dispatched: { label: "Dispatched", color: "var(--chart-3)" },
} as const;
const PRE = ["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"];
const short = (s: keyof typeof STAGE_LABELS) => STAGE_LABELS[s].replace("Awaiting ", "").replace(" confirmation", "");

export function OrdersOverview({ d }: { d: OrderInsights }) {
  const active = d.phases.pre + d.phases.production + d.phases.dispatched;
  const promised = d.delivery.onTrack + d.delivery.late;
  const onTrackShare = promised ? d.delivery.onTrack / promised : 1;

  return (
    <div className="grid gap-5 lg:grid-cols-6">
      <VizCard icon={PieChart} tone="var(--chart-4)" title="Where orders are" subtitle={`${active} active`} className="lg:col-span-2">
        <Donut size={150} stacked slices={(["pre", "production", "dispatched"] as const).map((k) => ({ label: PHASE[k].label, value: d.phases[k], color: PHASE[k].color }))} center={{ value: String(active), label: "active" }} />
      </VizCard>

      <VizCard icon={Factory} tone="var(--chart-2)" title="Production flow" subtitle="Orders waiting at each stage. Tap a stage to see them." className="lg:col-span-4">
        <StageFlow
          stages={d.stages.map((s) => ({
            label: short(s.stage),
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

      <VizCard icon={Truck} tone="var(--good)" title="Delivery promise" subtitle="Orders not yet dispatched, against their expected date" className="lg:col-span-2">
        <div className="flex items-center gap-4">
          <Ring ratio={onTrackShare} value={`${Math.round(onTrackShare * 100)}%`} label="on track" color={onTrackShare >= 0.8 ? "var(--good)" : "var(--warn)"} />
          <ul className="space-y-1.5 text-[13px]">
            <li>
              <span className="font-semibold text-good">{d.delivery.onTrack}</span> <span className="text-ink-2">on track</span>
            </li>
            <li>
              <span className="font-semibold text-bad">{d.delivery.late}</span> <span className="text-ink-2">past expected date</span>
            </li>
            {d.delivery.noDate > 0 && (
              <li>
                <span className="font-semibold">{d.delivery.noDate}</span> <span className="text-ink-2">without a date</span>
              </li>
            )}
          </ul>
        </div>
      </VizCard>

      <VizCard icon={PauseCircle} tone="var(--warn)" title="On hold for procurement" subtitle={d.onHold.length ? "Waiting for materials, longest first" : "Nothing is waiting for materials"} className="lg:col-span-2">
        {d.onHold.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">All clear.</p>
        ) : (
          <ul className="space-y-3">
            {d.onHold.slice(0, 5).map((h) => (
              <li key={h.id}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <Link href={`/orders/${h.id}`} className="font-medium tabular-nums hover:text-brand">
                    {h.code}
                  </Link>
                  <span className="text-ink-3">{h.daysHeld === 0 ? "today" : `${h.daysHeld} day${h.daysHeld === 1 ? "" : "s"}`}</span>
                </div>
                <p className="truncate text-[12.5px] text-ink-2">{h.reason ?? "No reason given"}</p>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-warn" style={{ width: `${Math.min(100, Math.max(6, (h.daysHeld / 14) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </VizCard>

      <VizCard icon={Hourglass} tone="var(--bad)" title="Waiting longest" subtitle="Days at the current stage" className="lg:col-span-2">
        <BarList
          rows={d.waiting.map((w) => ({ label: `${w.code} · ${short(w.stage)}`, value: w.days, sub: `${w.vendorName}${w.onHold ? " · on hold" : ""}` }))}
          format={(n) => `${n} day${n === 1 ? "" : "s"}`}
          empty="No active orders"
        />
      </VizCard>

      <VizCard icon={Layers} tone="var(--chart-1)" title="What's being made" subtitle="Shutters in active orders, by order type" className="lg:col-span-3">
        <RadialBars rows={d.mix.slice(0, 6).map((m) => ({ label: m.orderType, value: m.shutters }))} color="var(--chart-1)" size={190} format={(n) => `${n} shutters`} />
      </VizCard>

      <VizCard icon={CalendarDays} tone="var(--chart-4)" title="Order intake" subtitle="New orders per day, last 12 weeks" className="lg:col-span-3">
        <CalendarHeatmap days={d.intake} label="orders" color="var(--chart-4)" />
      </VizCard>
    </div>
  );
}
