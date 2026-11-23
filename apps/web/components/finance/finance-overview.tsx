"use client";

import { ArrowLeftRight, Banknote, Clock3, Factory, PackageX, PieChart, ShoppingCart, Truck, Wallet } from "lucide-react";
import { EXPENSE_LABELS, PAYMENT_METHOD_LABELS, type FinanceSummary } from "@vawe/shared";
import { CalendarHeatmap, MirrorColumns, RadialBars, Ring, SegmentedBar, VizCard } from "../viz";
import { dayLabel, dayLong } from "@/lib/dates";
import { money, moneyShort } from "@/lib/format";

// The Finance overview as pictures. Every number is still there, as a label or on hover.

const AGING_COLORS = ["var(--good)", "var(--warn)", "color-mix(in oklab, var(--bad) 70%, var(--surface))", "var(--bad)"];

export function FinanceOverview({ s, production }: { s: FinanceSummary; production: { date: string; value: number }[] }) {
  const collectedShare = s.received / Math.max(1, s.received + s.receivable);
  const deliveredShare = s.deliveredUnpaid.amount / Math.max(1, s.receivable);
  const methodTotal = s.receivedByMethod.reduce((t, m) => t + m.amount, 0);
  const net = s.received - s.expenseTotal - s.purchases;

  return (
    <div className="grid gap-5 lg:grid-cols-6">
      <VizCard icon={Wallet} tone="var(--good)" title="Collected vs still owed" subtitle={`${dayLabel(s.from)} to ${dayLabel(s.to)}`} className="lg:col-span-2">
        <div className="flex items-center gap-4">
          <Ring ratio={collectedShare} value={moneyShort(s.received)} label="collected" color="var(--good)" />
          <div className="min-w-0 space-y-2 text-[13px]">
            <p>
              <span className="text-ink-3">Still owed</span>
              <br />
              <span className="text-lg font-semibold">{moneyShort(s.receivable)}</span>
            </p>
            <p className={net >= 0 ? "text-good" : "text-bad"}>
              {net >= 0 ? "+" : "−"}
              {moneyShort(Math.abs(net))} <span className="text-ink-3">net cash in</span>
            </p>
          </div>
        </div>
      </VizCard>

      <VizCard icon={Truck} tone="var(--warn)" title="Delivered, not paid" subtitle="Share of what's owed on delivered orders" className="lg:col-span-2">
        <div className="flex items-center gap-4">
          <Ring ratio={deliveredShare} value={moneyShort(s.deliveredUnpaid.amount)} label={`${s.deliveredUnpaid.count} order${s.deliveredUnpaid.count === 1 ? "" : "s"}`} color="var(--warn)" />
          <p className="text-[13px] text-ink-2">
            {Math.round(deliveredShare * 100)}% of the open balance is for orders already delivered.
            {s.overdue > 0 && <span className="mt-2 block font-medium text-bad">{moneyShort(s.overdue)} is past its due date.</span>}
          </p>
        </div>
      </VizCard>

      <VizCard icon={Clock3} tone="var(--bad)" title="Money owed, by age" subtitle="How late the open balances are" className="lg:col-span-2">
        <SegmentedBar parts={s.aging.map((a, i) => ({ label: a.label, value: a.amount, color: AGING_COLORS[i]! }))} format={moneyShort} />
      </VizCard>

      <VizCard icon={ArrowLeftRight} tone="var(--chart-1)" title="Cash flow" subtitle="Received each day above the line, expenses below" className="lg:col-span-6">
        <MirrorColumns
          points={s.daily.map((d) => ({ label: dayLabel(d.date), title: dayLong(d.date), up: d.received, down: d.expenses }))}
          upLabel="Received"
          downLabel="Expenses"
          format={money}
        />
      </VizCard>

      <VizCard icon={PieChart} tone="var(--chart-2)" title="Where the money went" subtitle={`${moneyShort(s.expenseTotal)} in expenses, by type`} className="lg:col-span-3">
        <RadialBars rows={s.expenses.map((e) => ({ label: EXPENSE_LABELS[e.category], value: e.amount }))} format={money} size={200} />
      </VizCard>

      <VizCard icon={Factory} tone="var(--chart-2)" title="Daily production cost" subtitle="Darker days cost more" className="lg:col-span-3">
        <CalendarHeatmap days={production.map((p) => ({ date: p.date, count: p.value }))} color="var(--chart-2)" format={money} />
      </VizCard>

      <VizCard icon={Banknote} tone="var(--chart-1)" title="How customers pay" subtitle="Share of money received, by method" className="lg:col-span-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {s.receivedByMethod.map((m) => {
            const share = methodTotal ? m.amount / methodTotal : 0;
            return (
              <div key={m.method} className="flex flex-col items-center gap-2 text-center">
                <Ring ratio={share} size={92} thickness={9} value={`${Math.round(share * 100)}%`} label={PAYMENT_METHOD_LABELS[m.method]} color="var(--chart-1)" />
                <span className="text-[13px] font-semibold tabular-nums">{moneyShort(m.amount)}</span>
              </div>
            );
          })}
        </div>
      </VizCard>

      <div className="grid gap-5 lg:col-span-2">
        <VizCard icon={PackageX} tone="var(--chart-4)" title="Returns" subtitle="Credit given in this range">
          <p className="text-2xl font-semibold tracking-tight">{moneyShort(s.returns)}</p>
        </VizCard>
        <VizCard icon={ShoppingCart} tone="var(--chart-3)" title="Purchases" subtitle="Materials bought in this range">
          <p className="text-2xl font-semibold tracking-tight">{moneyShort(s.purchases)}</p>
        </VizCard>
      </div>
    </div>
  );
}
