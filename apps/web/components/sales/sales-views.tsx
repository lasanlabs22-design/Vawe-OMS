"use client";

import { useState } from "react";
import Link from "next/link";
import { SOURCE_LABELS, sourceDetailLabel, type ProductStat, type SalesDay, type SalesOverview, type SalesProducts, type SalesRange, type SalesSources } from "@vawe/shared";
import { BarList, change, ChartCard, ColumnChart, CountUp, StatTile, TrendChart } from "../charts";
import { Badge, cx } from "../ui";
import { DateRange, useUrlState } from "../url-state";
import { addMonths, dayLabel, dayLong, monthLabel, monthLong, rangePresets, todayIST } from "@/lib/dates";
import { money, moneyShort, number } from "@/lib/format";

const rupees = (n: number) => money(n);
const rupeesShort = (n: number) => moneyShort(n);

// ---------- This month ----------

export function SalesOverviewView({ data }: { data: SalesOverview }) {
  const { set } = useUrlState();
  const current = todayIST().slice(0, 7);
  const avg = data.thisMonth.orders ? data.thisMonth.value / data.thisMonth.orders : 0;
  const prevAvg = data.lastMonthToDate.orders ? data.lastMonthToDate.value / data.lastMonthToDate.orders : 0;
  const shown = data.month === current ? data.daily.filter((d) => d.date <= todayIST()) : data.daily;
  const months = data.monthly;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          aria-label="Month"
          value={data.month}
          max={current}
          onChange={(e) => e.target.value && set({ month: e.target.value })}
          className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px]"
        />
        {data.month !== current && (
          <button type="button" onClick={() => set({ month: null })} className="h-9 rounded-lg px-3 text-[13px] font-medium text-brand hover:bg-brand-soft">
            Back to this month
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Orders in ${monthLong(data.month)}`} value={data.thisMonth.orders} delta={deltaOf(data.thisMonth.orders, data.lastMonthToDate.orders)} />
        <StatTile label="Order value" value={data.thisMonth.value} format={rupeesShort} delta={deltaOf(data.thisMonth.value, data.lastMonthToDate.value)} delay={60} />
        <StatTile label="Average order" value={avg} format={rupeesShort} delta={deltaOf(avg, prevAvg)} delay={120} />
        <StatTile
          label="3-month average"
          value={months.slice(0, 3).reduce((s, m) => s + m.value, 0) / 3}
          format={rupeesShort}
          hint="Value per month, the 3 months before"
          delay={180}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Orders per day"
          subtitle={monthLong(data.month)}
          table={{ columns: ["Day", "Orders", "Value"], rows: shown.map((d) => [dayLong(d.date), d.orders, rupees(d.value)]) }}
        >
          <ColumnChart data={shown.map((d) => ({ label: d.date.slice(8, 10).replace(/^0/, ""), value: d.orders, tooltip: dayLong(d.date) }))} integer format={(n) => number(n)} valueFormat={(n) => `${number(n)} order${n === 1 ? "" : "s"}`} />
        </ChartCard>
        <ChartCard title="Order value per day" subtitle="Before GST" table={{ columns: ["Day", "Value"], rows: shown.map((d) => [dayLong(d.date), rupees(d.value)]) }}>
          <TrendChart points={shown.map((d) => ({ label: dayLabel(d.date), a: d.value, title: dayLong(d.date) }))} aLabel="value" valueFormat={rupees} />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Last 3 months vs this month: value"
          subtitle="Highlighted: the selected month"
          table={{ columns: ["Month", "Orders", "Value"], rows: months.map((m) => [monthLong(m.month), m.orders, rupees(m.value)]) }}
        >
          <ColumnChart data={months.map((m) => ({ label: monthLabel(m.month), value: m.value, highlight: m.month === data.month, tooltip: monthLong(m.month) }))} valueFormat={rupees} />
        </ChartCard>
        <ChartCard title="Last 3 months vs this month: orders" subtitle="Number of orders">
          <ColumnChart data={months.map((m) => ({ label: monthLabel(m.month), value: m.orders, highlight: m.month === data.month, tooltip: monthLong(m.month) }))} integer format={(n) => number(n)} valueFormat={(n) => `${number(n)} orders`} />
        </ChartCard>
      </div>
    </div>
  );
}

function deltaOf(now: number, before: number) {
  const c = change(now, before);
  return c === null ? null : { value: c, label: "vs last month, same days" };
}

// ---------- Day by day ----------

export function SalesDayByDay({ data }: { data: SalesRange }) {
  const { set } = useUrlState();
  const today = todayIST();
  const points = data.current.map((d, i) => ({ label: dayLabel(d.date), a: d.value, b: data.previous[i]?.value ?? 0, title: dayLong(d.date) }));
  const prevLabel = data.previous.length ? `${dayLabel(data.previous[0]!.date)} â€“ ${dayLabel(data.previous[data.previous.length - 1]!.date)}` : "previous period";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <DateRange from={data.from} to={data.to} presets={rangePresets(today)} />
        <p className="text-[13px] text-ink-3">
          Tip: pick any start date and use{" "}
          <button type="button" className="font-medium text-brand hover:underline" onClick={() => set({ to: addMonths(data.from, 1) > today ? today : addMonths(data.from, 1) })}>
            same day next month
          </button>{" "}
          for the client's month-to-month view.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Orders in range" value={data.totals.orders} delta={rangeDelta(data.totals.orders, data.previousTotals.orders)} />
        <StatTile label="Value in range" value={data.totals.value} format={rupeesShort} delta={rangeDelta(data.totals.value, data.previousTotals.value)} delay={60} />
        <StatTile label="Best day" value={Math.max(0, ...data.current.map((d) => d.value))} format={rupeesShort} hint={bestDay(data)} delay={120} />
        <StatTile label="Days with orders" value={data.current.filter((d) => d.orders > 0).length} hint={`of ${data.current.length} days`} delay={180} />
      </div>

      <ChartCard
        title="Value per day"
        subtitle={`${dayLong(data.from)} â†’ ${dayLong(data.to)}, against the ${data.current.length} days before`}
        legend={[
          { label: "This range", color: "var(--chart-1)" },
          { label: prevLabel, color: "var(--chart-2)" },
        ]}
      >
        <TrendChart points={points} aLabel="this range" bLabel="before" valueFormat={rupees} height={280} />
      </ChartCard>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h3 className="font-semibold">Every day</h3>
          <p className="text-[13px] text-ink-3">Orders and value for each day in the range</p>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium sm:px-5">Day</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="hidden px-4 py-2 text-right font-medium sm:table-cell sm:px-5">Same day before</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {[...data.current].reverse().map((d, ri) => {
                const i = data.current.length - 1 - ri;
                const prev = data.previous[i];
                return (
                  <tr key={d.date} className={cx(d.orders === 0 && "text-ink-3")}>
                    <td className="px-4 py-2 sm:px-5">{dayLong(d.date)}</td>
                    <td className="px-3 py-2 text-right">{d.orders}</td>
                    <td className="px-3 py-2 text-right font-medium">{rupees(d.value)}</td>
                    <td className="hidden px-4 py-2 text-right text-ink-3 sm:table-cell sm:px-5">{prev ? `${dayLabel(prev.date)}: ${rupees(prev.value)}` : "â€”"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function rangeDelta(now: number, before: number) {
  const c = change(now, before);
  return c === null ? null : { value: c, label: "vs the days before" };
}

function bestDay(data: SalesRange): string {
  const best = data.current.reduce((b, d) => (d.value > (b?.value ?? -1) ? d : b), data.current[0]);
  return best && best.value > 0 ? dayLong(best.date) : "No orders yet";
}

// ---------- Compare days ----------

/** Chosen days side by side, e.g. 1 Sept vs 1 Oct vs 1 Nov. Dates live in ?dates=. */
export function SalesCompareDays({ days, canOpenOrders }: { days: SalesDay[]; canOpenOrders: boolean }) {
  const { set } = useUrlState();
  const today = todayIST();
  const dates = days.map((d) => d.date);
  const latest = dates[dates.length - 1] ?? today;
  const first = days[0];
  const setDates = (list: string[]) => set({ dates: [...new Set(list)].sort().join(",") });
  const sameDayBack = (months: number) => Array.from({ length: months }, (_, i) => addMonths(latest, -i));
  const firstOfMonths = (months: number) => Array.from({ length: months }, (_, i) => `${addMonths(today, -i).slice(0, 7)}-01`);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {dates.map((d) => (
            <span key={d} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface pr-1 pl-3 text-[13px] font-medium">
              {dayLong(d)}
              {dates.length > 1 && (
                <button type="button" onClick={() => setDates(dates.filter((x) => x !== d))} className="rounded-md px-1.5 py-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Remove ${dayLong(d)}`}>
                  ×
                </button>
              )}
            </span>
          ))}
          {dates.length < 12 && (
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-3 text-[13px] text-ink-2">
              Add a date
              <input type="date" max={today} aria-label="Add a date" onChange={(e) => e.target.value && setDates([...dates, e.target.value])} className="bg-transparent outline-none" />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-3">Quick picks:</span>
          <button type="button" onClick={() => setDates(sameDayBack(3))} className="rounded-md px-2 py-1 font-medium text-brand hover:bg-brand-soft">
            Same day, last 3 months
          </button>
          <button type="button" onClick={() => setDates(sameDayBack(6))} className="rounded-md px-2 py-1 font-medium text-brand hover:bg-brand-soft">
            Same day, last 6 months
          </button>
          <button type="button" onClick={() => setDates(firstOfMonths(3))} className="rounded-md px-2 py-1 font-medium text-brand hover:bg-brand-soft">
            1st of the last 3 months
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Order value on each day" subtitle="Before GST" table={{ columns: ["Day", "Orders", "Value"], rows: days.map((d) => [dayLong(d.date), d.orders, rupees(d.value)]) }}>
          <ColumnChart data={days.map((d) => ({ label: dayLabel(d.date), value: d.value, highlight: d.date === latest, tooltip: dayLong(d.date) }))} valueFormat={rupees} />
        </ChartCard>
        <ChartCard title="Orders on each day" subtitle="Number of orders">
          <ColumnChart data={days.map((d) => ({ label: dayLabel(d.date), value: d.orders, highlight: d.date === latest, tooltip: dayLong(d.date) }))} integer format={(n) => number(n)} valueFormat={(n) => `${number(n)} order${n === 1 ? "" : "s"}`} />
        </ChartCard>
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium sm:px-5">Day</th>
                <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                <th className="px-3 py-2.5 text-right font-medium">Shutters</th>
                <th className="px-3 py-2.5 text-right font-medium">Value</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">vs {first ? dayLabel(first.date) : "first day"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {days.map((d, i) => {
                const c = first && i > 0 ? change(d.value, first.value) : null;
                return (
                  <tr key={d.date}>
                    <td className="px-4 py-2.5 font-medium sm:px-5">{dayLong(d.date)}</td>
                    <td className="px-3 py-2.5 text-right">{d.orders}</td>
                    <td className="px-3 py-2.5 text-right">{d.shutters}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{rupees(d.value)}</td>
                    <td className={cx("px-4 py-2.5 text-right sm:px-5", c === null || Math.round(c) === 0 ? "text-ink-3" : c > 0 ? "text-good" : "text-bad")}>
                      {i === 0 ? "Base" : c === null ? "New" : Math.round(c) === 0 ? "Same" : `${c > 0 ? "▲" : "▼"} ${Math.abs(Math.round(c))}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => (
          <section key={d.date} className="rounded-2xl border border-line bg-surface">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
              <h3 className="font-semibold">{dayLong(d.date)}</h3>
              <span className="text-[13px] text-ink-3">
                {d.orders} order{d.orders === 1 ? "" : "s"}
              </span>
            </div>
            {d.list.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-ink-3">No orders that day.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.list.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      {canOpenOrders ? (
                        <Link href={`/orders/${o.id}`} className="font-medium tabular-nums hover:text-brand">
                          {o.code}
                        </Link>
                      ) : (
                        <span className="font-medium tabular-nums">{o.code}</span>
                      )}
                      <p className="truncate text-[12.5px] text-ink-3">
                        {o.vendorName}
                        {o.customerName && ` · ${o.customerName}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{rupees(o.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- Products ----------

const DIMENSIONS = [
  { key: "orderTypes", label: "Order type" },
  { key: "frameTypes", label: "Frame" },
  { key: "glassTypes", label: "Glass" },
  { key: "handleTypes", label: "Handle" },
] as const;

export function SalesProductsView({ data, from, to }: { data: SalesProducts; from: string; to: string }) {
  const [dim, setDim] = useState<(typeof DIMENSIONS)[number]["key"]>("orderTypes");
  const rows = data[dim];
  const sold = rows.filter((r) => r.shutters > 0);
  const unsold = rows.filter((r) => r.shutters === 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRange from={from} to={to} presets={rangePresets()} />
        <div role="radiogroup" aria-label="Group by" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={dim === d.key}
              onClick={() => setDim(d.key)}
              className={cx("h-8 rounded-md px-3 text-[13px] font-medium", dim === d.key ? "bg-solid text-on-solid" : "text-ink-2 hover:text-ink")}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <ChartCard title="Top products" subtitle="By value (before GST)">
          <BarList
            rows={sold.slice(0, 8).map((r) => ({ label: r.name, value: r.value, sub: `${number(r.orders)} order${r.orders === 1 ? "" : "s"} Â· ${number(r.shutters)} shutters Â· ${share(r.value, totalValue)}` }))}
            format={rupees}
            empty="No sales in this range yet"
          />
        </ChartCard>
        <ChartCard title="Most shutters made" subtitle="By number of shutters">
          <BarList
            rows={[...sold].sort((a, b) => b.shutters - a.shutters).slice(0, 8).map((r) => ({ label: r.name, value: r.shutters, sub: `${number(r.sqft, 1)} sq ft` }))}
            format={(n) => `${number(n)}`}
            empty="No sales in this range yet"
          />
        </ChartCard>
      </div>

      <ProductTable rows={rows} />

      {unsold.length > 0 && (
        <p className="text-[13px] text-ink-3">
          {unsold.length} {DIMENSIONS.find((d) => d.key === dim)!.label.toLowerCase()} option{unsold.length === 1 ? "" : "s"} didn't sell in this range.
        </p>
      )}
    </div>
  );
}

const share = (v: number, total: number) => (total > 0 ? `${Math.round((v / total) * 100)}% of value` : "");

function ProductTable({ rows }: { rows: ProductStat[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h3 className="font-semibold">Product-level sales</h3>
        <p className="text-[13px] text-ink-3">Every product, including the ones that aren't selling</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium sm:px-5">Product</th>
              <th className="px-3 py-2 text-right font-medium">Orders</th>
              <th className="px-3 py-2 text-right font-medium">Shutters</th>
              <th className="px-3 py-2 text-right font-medium">Sq ft</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-4 py-2 text-right font-medium sm:px-5">Last sold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-2.5 sm:px-5">
                  <span className={cx("font-medium", r.shutters === 0 && "text-ink-3")}>{r.name}</span>
                  {r.shutters === 0 && (
                    <span className="ml-2">
                      <Badge tone="warn">Not selling</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">{number(r.orders)}</td>
                <td className="px-3 py-2.5 text-right">{number(r.shutters)}</td>
                <td className="px-3 py-2.5 text-right">{number(r.sqft, 1)}</td>
                <td className="px-3 py-2.5 text-right font-medium">{rupees(r.value)}</td>
                <td className="px-4 py-2.5 text-right text-ink-3 sm:px-5">{r.lastSold ? dayLabel(r.lastSold) : "â€”"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Sources (funnel) ----------

export function SalesSourcesView({ data, from, to }: { data: SalesSources; from: string; to: string }) {
  const total = data.sources.reduce((s, x) => s + x.orders, 0);
  const totalValue = data.sources.reduce((s, x) => s + x.value, 0);
  const ranked = [...data.sources].sort((a, b) => b.orders - a.orders);

  return (
    <div className="space-y-5">
      <DateRange from={from} to={to} presets={rangePresets()} />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <ChartCard
          title="Where orders come from"
          subtitle={`${number(total)} orders in this range`}
          table={{ columns: ["Source", "Orders", "Share", "Value"], rows: ranked.map((s) => [SOURCE_LABELS[s.source], s.orders, total ? `${Math.round((s.orders / total) * 100)}%` : "0%", rupees(s.value)]) }}
        >
          <FunnelBars rows={ranked.map((s) => ({ label: SOURCE_LABELS[s.source], orders: s.orders, value: s.value }))} total={total} />
        </ChartCard>

        <ChartCard title="By value" subtitle="Before GST">
          <BarList rows={[...data.sources].sort((a, b) => b.value - a.value).map((s) => ({ label: SOURCE_LABELS[s.source], value: s.value, sub: share(s.value, totalValue), muted: s.value === 0 }))} format={rupees} />
        </ChartCard>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {data.sources
          .filter((s) => s.details.length > 0)
          .map((s) => (
            <ChartCard key={s.source} title={SOURCE_LABELS[s.source]} subtitle="Breakdown">
              <BarList
                rows={[...s.details].sort((a, b) => b.orders - a.orders).map((d) => ({ label: sourceDetailLabel(s.source, d.detail) ?? d.detail, value: d.orders, sub: rupees(d.value) }))}
                format={(n) => `${number(n)} orders`}
              />
            </ChartCard>
          ))}
      </div>
    </div>
  );
}

/** Tapering bars, widest first: the share of orders from each source. */
function FunnelBars({ rows, total }: { rows: { label: string; orders: number; value: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.orders));
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => {
        const pct = (r.orders / max) * 100;
        return (
          <li key={r.label} style={{ animationDelay: `${i * 90}ms` }} className="animate-rise">
            <div className="flex items-center gap-3">
              <div className="relative h-11 flex-1">
                <div
                  className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-lg bg-chart-1 transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ width: `${Math.max(pct, r.orders ? 6 : 1.5)}%`, opacity: r.orders ? 1 : 0.25 }}
                />
                <div className="relative flex h-full items-center justify-between px-3 text-sm">
                  <span className="rounded bg-surface/85 px-1.5 font-medium">{r.label}</span>
                  <span className="rounded bg-surface/85 px-1.5 font-semibold tabular-nums">
                    <CountUp value={r.orders} /> <span className="font-normal text-ink-3">Â· {total ? Math.round((r.orders / total) * 100) : 0}%</span>
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
