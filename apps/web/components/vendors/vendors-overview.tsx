"use client";

import { BellRing, Clock3, Coins, Handshake, PieChart, ShieldCheck, Trophy, Wallet } from "lucide-react";
import { PAYMENT_TERM_LABELS, PAYMENT_TERMS, type Followup, type VendorListItem } from "@vawe/shared";
import { BarList } from "../charts";
import { Donut, RadialBars, Ring, SegmentedBar, SplitBars, VizCard, Waffle } from "../viz";
import { dayLabel, todayIST } from "@/lib/dates";
import { moneyShort } from "@/lib/format";

// The Vendors overview as pictures. Health colours match the main Overview.

const HEALTH_COLOR = { good: "var(--good)", watch: "var(--warn)", at_risk: "var(--bad)", new: "var(--line)" } as const;
const HEALTH_LABEL = { good: "Paying on time", watch: "Watch", at_risk: "At risk", new: "Nothing due yet" } as const;
const HEALTH_ORDER = ["at_risk", "watch", "good", "new"] as const;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function VendorsOverview({ vendors, followups }: { vendors: VendorListItem[]; followups: Followup[] }) {
  const today = todayIST();
  // Health, terms and pricing describe real firms; the walk-in account is left out of those.
  const firms = vendors.filter((v) => v.isActive && !v.isWalkIn);
  const byHealth = (h: (typeof HEALTH_ORDER)[number]) => firms.filter((v) => v.stats.health === h).length;
  const due = firms.length - byHealth("new");
  const onTime = due ? byHealth("good") / due : 1;

  const owing = vendors
    .filter((v) => v.stats.outstanding > 0)
    .sort((a, b) => b.stats.outstanding - a.stats.outstanding)
    .slice(0, 6);
  const buyers = vendors
    .filter((v) => v.stats.billed > 0)
    .sort((a, b) => b.stats.billed - a.stats.billed)
    .slice(0, 6);
  const quiet = firms
    .filter((v) => v.stats.lastOrderDate)
    .map((v) => ({ v, gap: daysBetween(v.stats.lastOrderDate!, today) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 6);
  const longest = Math.max(1, quiet[0]?.gap ?? 0);

  const late = followups.filter((f) => f.dueDate && f.dueDate < today).length;
  const dueToday = followups.filter((f) => f.dueDate === today).length;
  const later = followups.length - late - dueToday;

  const sqft = firms.filter((v) => v.pricingModel === "sqft").length;

  return (
    <div className="grid gap-5 lg:grid-cols-6">
      <VizCard icon={Handshake} tone="var(--chart-3)" title="Payment health" subtitle="One square per vendor" className="lg:col-span-2">
        <Waffle
          tiles={HEALTH_ORDER.flatMap((h) => firms.filter((v) => v.stats.health === h).map((v) => ({ label: `${v.firmName}: ${HEALTH_LABEL[h]}`, color: HEALTH_COLOR[h] })))}
          legend={HEALTH_ORDER.map((h) => ({ label: HEALTH_LABEL[h], color: HEALTH_COLOR[h], count: byHealth(h) }))}
        />
      </VizCard>

      <VizCard icon={ShieldCheck} tone="var(--good)" title="Paying on time" subtitle="Vendors with something due" className="lg:col-span-2">
        <div className="flex items-center gap-4">
          <Ring ratio={onTime} value={`${Math.round(onTime * 100)}%`} label="on time" color={onTime >= 0.8 ? "var(--good)" : "var(--warn)"} />
          <ul className="space-y-1.5 text-[13px]">
            <li>
              <span className="font-semibold text-good">{byHealth("good")}</span> <span className="text-ink-2">on time</span>
            </li>
            <li>
              <span className="font-semibold text-warn">{byHealth("watch")}</span> <span className="text-ink-2">to watch</span>
            </li>
            <li>
              <span className="font-semibold text-bad">{byHealth("at_risk")}</span> <span className="text-ink-2">at risk</span>
            </li>
          </ul>
        </div>
      </VizCard>

      <VizCard icon={BellRing} tone="var(--warn)" title="Follow-ups" subtitle={`${followups.length} open`} className="lg:col-span-2">
        {followups.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">Nothing to chase.</p>
        ) : (
          <SegmentedBar
            parts={[
              { label: "Late", value: late, color: "var(--bad)" },
              { label: "Due today", value: dueToday, color: "var(--warn)" },
              { label: "Coming up", value: later, color: "var(--chart-1)" },
            ]}
          />
        )}
      </VizCard>

      <VizCard icon={Wallet} tone="var(--bad)" title="Who owes the most" subtitle="Outstanding, with the overdue part first" className="lg:col-span-2">
        <SplitBars
          rows={owing.map((v) => ({ label: v.firmName, href: `/vendors/${v.id}`, a: v.stats.overdue, b: v.stats.outstanding - v.stats.overdue }))}
          parts={[
            { label: "Overdue", color: "var(--bad)" },
            { label: "Not yet due", color: "var(--chart-1)" },
          ]}
          format={moneyShort}
          empty="No vendor owes anything."
        />
      </VizCard>

      <VizCard icon={Trophy} tone="var(--chart-1)" title="Biggest buyers" subtitle="Total billed, all time" className="lg:col-span-2">
        <BarList rows={buyers.map((v) => ({ label: v.firmName, value: v.stats.billed, sub: `${v.stats.orders} order${v.stats.orders === 1 ? "" : "s"}` }))} format="moneyShort" empty="No orders yet" />
      </VizCard>

      <VizCard icon={Clock3} tone="var(--chart-2)" title="Gone quiet" subtitle="Vendors who haven't ordered in a while, longest gap first" className="lg:col-span-2">
        {quiet.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">No orders yet.</p>
        ) : (
          <ul className="space-y-3">
            {quiet.map(({ v, gap }, i) => (
              <li key={v.id}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <a href={`/vendors/${v.id}`} className="min-w-0 truncate font-medium hover:text-brand">
                    {v.firmName}
                  </a>
                  <span className="shrink-0 font-semibold">{gap === 0 ? "Ordered today" : `No order for ${days(gap)}`}</span>
                </div>
                <p className="text-[12px] text-ink-3">Last order on {dayLabel(v.stats.lastOrderDate!)}</p>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div
                    className="animate-grow-x h-full origin-left rounded-full bg-chart-2"
                    style={{ width: `${Math.max(4, (gap / longest) * 100)}%`, animationDelay: `${i * 80}ms` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </VizCard>

      <VizCard icon={Coins} tone="var(--chart-4)" title="Payment terms" subtitle="Vendors on each term" className="lg:col-span-3">
        <RadialBars
          rows={PAYMENT_TERMS.map((t) => ({ label: PAYMENT_TERM_LABELS[t], value: firms.filter((v) => v.paymentTerms === t).length })).filter((r) => r.value > 0)}
          color="var(--chart-4)"
          size={190}
        />
      </VizCard>

      <VizCard icon={PieChart} tone="var(--chart-1)" title="Pricing model" subtitle="How each vendor is priced" className="lg:col-span-3">
        <Donut
          size={150}
          slices={[
            { label: "Per square foot (SQFT)", value: sqft, color: "var(--chart-1)" },
            { label: "Per running foot (RFT)", value: firms.length - sqft, color: "var(--chart-2)" },
          ]}
          center={{ value: String(firms.length), label: "vendors" }}
        />
      </VizCard>
    </div>
  );
}
