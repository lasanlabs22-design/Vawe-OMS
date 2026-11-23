"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { change, CountUp } from "../charts";
import { DailyBars } from "../viz";
import { cx } from "@/lib/cx";
import { dayLabel, dayLong } from "@/lib/dates";
import { moneyShort } from "@/lib/format";

/**
 * A month's sales at a glance: the value in large type, its change against the same days last
 * month, a few facts, and the value of each day as slim columns. Used on Overview and Sales.
 */
export function MonthHero({
  value,
  orders,
  before,
  lastMonthTotal,
  daily,
  caption,
}: {
  value: number;
  orders: number;
  /** Last month's value up to the same day of the month. */
  before: number;
  lastMonthTotal: number;
  daily: { date: string; value: number }[];
  caption: string;
}) {
  const growth = change(value, before);
  const avg = daily.reduce((s, d) => s + d.value, 0) / Math.max(1, daily.length);
  return (
    <div className="grid gap-6 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <CountUp value={value} format="moneyShort" className="block text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums" />
        {growth !== null && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
            <span className={cx("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold", growth >= 0 ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
              {growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(Math.round(growth))}%
            </span>
            vs the same days last month
          </p>
        )}
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 sm:grid-cols-1 sm:gap-2.5">
          <Fact label="Orders" value={orders.toLocaleString("en-IN")} />
          <Fact label="Average order" value={orders ? moneyShort(value / orders) : "None yet"} />
          <Fact label="Last month in all" value={moneyShort(lastMonthTotal)} />
        </dl>
      </div>
      <div className="min-w-0">
        <p className="mb-3 flex flex-wrap items-center justify-between gap-x-3 text-[12.5px] text-ink-3">
          <span>{caption}</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t border-dashed border-ink-3" />
            avg {moneyShort(avg)} a day
          </span>
        </p>
        <DailyBars days={daily.map((d) => ({ label: dayLabel(d.date), title: dayLong(d.date), value: d.value }))} format={moneyShort} height={170} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 sm:flex sm:items-baseline sm:justify-between sm:gap-3">
      <dt className="truncate text-[12px] text-ink-3">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
