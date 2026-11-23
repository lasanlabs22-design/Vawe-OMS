"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";

// Small SVG charts built to one spec: thin marks (columns ≤ 24px with a 4px rounded end, 2px lines,
// a 10% area wash), hairline solid grid, a hover/focus tooltip on every chart, a table view, and
// entrance animation (columns grow from the baseline, lines draw in, bars slide out, numbers count
// up). Every animation is skipped when the device asks for reduced motion.

// ---------- Formats ----------
// Server pages can't hand functions to these client components, so they name a format instead.

export type Fmt = "number" | "decimal" | "money" | "moneyShort" | "percent" | "days" | ((n: number) => string);

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
function moneyShortFmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)} L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)} K`;
  return `₹${Math.round(n)}`;
}
const FORMATS: Record<Exclude<Fmt, (n: number) => string>, (n: number) => string> = {
  number: (n) => Math.round(n).toLocaleString("en-IN"),
  decimal: (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 }),
  money: (n) => inr.format(n),
  moneyShort: moneyShortFmt,
  percent: (n) => `${Math.round(n)}%`,
  days: (n) => `${n.toFixed(1)} days`,
};
const resolve = (f: Fmt | undefined, fallback: (n: number) => string) => (f === undefined ? fallback : typeof f === "function" ? f : FORMATS[f]);

// ---------- Motion helpers ----------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (then stays true), so charts animate when seen. */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** A chart's box: its width (for the SVG) and whether it has been seen (to start the animation). */
function useChartBox(): [React.RefObject<HTMLDivElement | null>, number, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.floor(e.contentRect.width)));
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.2 });
    ro.observe(el);
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  return [ref, width, seen];
}

/** A number that counts up from 0 when it first appears (eased, ~900 ms). */
export function CountUp({ value, format: fmt, className }: { value: number; format?: Fmt; className?: string }) {
  const format = resolve(fmt, FORMATS.number);
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced) return setShown(value);
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(begin + (value - begin) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value, reduced]);
  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}

// ---------- Scales ----------

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `${+(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${+(n / 1e5).toFixed(1)}L`;
  if (a >= 1e4) return `${+(n / 1e3).toFixed(0)}K`;
  if (a < 100 && !Number.isInteger(n)) return n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return Math.round(n).toLocaleString("en-IN");
};

// ---------- Frame ----------

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
  action,
}: {
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string; kind?: "line" | "box" }[];
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cx("rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {legend && (
            <ul className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-2">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span aria-hidden className={l.kind === "box" ? "size-2.5 rounded-[3px]" : "h-0.5 w-3.5 rounded-full"} style={{ background: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
          {action}
          {table && (
            <button type="button" onClick={() => setShowTable((s) => !s)} className="rounded-md px-2 py-1 text-[12.5px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink">
              {showTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </div>
      {showTable && table ? <DataTable columns={table.columns} rows={table.rows} /> : children}
    </section>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={cx("px-3 py-2 font-medium", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={cx("px-3 py-1.5", j > 0 && "text-right")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Keep inside the chart: flip to the left of the pointer near the right edge.
  const left = x > width - 170 ? x - 12 : x + 12;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 animate-fade rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg"
      style={{ left, top: Math.max(0, y - 10), transform: x > width - 170 ? "translateX(-100%)" : undefined }}
    >
      {children}
    </div>
  );
}

// ---------- Columns (one series; optional highlighted column) ----------

export interface Column {
  label: string;
  value: number;
  /** Full colour; others are drawn lighter (de-emphasised, same hue). */
  highlight?: boolean;
  tooltip?: string;
}

export function ColumnChart({
  data,
  height = 220,
  format: fmt,
  valueFormat: vfmt,
  integer = false,
}: {
  data: Column[];
  height?: number;
  format?: Fmt;
  valueFormat?: Fmt;
  /** Counts: keep the axis on whole numbers. */
  integer?: boolean;
}) {
  const format = resolve(fmt, compact);
  const valueFormat = resolve(vfmt, format);
  const [boxRef, width, seen] = useChartBox();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const anyHighlight = data.some((d) => d.highlight);

  const padL = 44;
  const padB = 26;
  const plotH = height - padB - 8;
  const rawMax = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const max = integer ? Math.max(2, Math.ceil(rawMax / 2) * 2) : rawMax;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const band = width > padL ? (width - padL) / Math.max(1, data.length) : 0;
  const barW = Math.min(24, Math.max(4, band * 0.6));
  // Room for a label every ~34px (day numbers) or ~52px (month names).
  const labelRoom = Math.max(...data.map((d) => d.label.length)) > 3 ? 52 : 34;
  const showEvery = Math.ceil(data.length / Math.max(1, Math.floor((width - padL) / labelRoom)));

  return (
    <div ref={boxRef} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Column chart">
          {ticks.map((t) => {
            const y = 8 + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line x1={padL} x2={width} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
                  {format(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * plotH;
            const x = padL + band * i + (band - barW) / 2;
            const y = 8 + plotH - h;
            const r = Math.min(4, h / 2, barW / 2);
            const path = h > 0 ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z` : "";
            return (
              <g key={i}>
                {path && (
                  <path
                    d={path}
                    fill="var(--chart-1)"
                    opacity={anyHighlight && !d.highlight ? 0.38 : hover === i ? 0.85 : 1}
                    style={{
                      transformOrigin: `${x}px ${8 + plotH}px`,
                      transform: seen || reduced ? "scaleY(1)" : "scaleY(0)",
                      transition: reduced ? undefined : `transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * (500 / Math.max(1, data.length))}ms, opacity 150ms`,
                    }}
                  />
                )}
                {(i % showEvery === 0 || d.highlight) && (
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" className={cx("text-[11px]", d.highlight ? "fill-ink font-medium" : "fill-ink-3")}>
                    {d.label}
                  </text>
                )}
                <rect
                  x={padL + band * i}
                  y={8}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${valueFormat(d.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={padL + band * hover + band / 2} y={8 + plotH - (data[hover].value / max) * plotH} width={width}>
          <p className="font-semibold tabular-nums">{valueFormat(data[hover].value)}</p>
          <p className="text-ink-3">{data[hover].tooltip ?? data[hover].label}</p>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Trend (line + area; optional comparison series) ----------

export interface TrendPoint {
  label: string;
  a: number;
  b?: number;
  /** Tooltip heading, e.g. the full date. */
  title?: string;
}

export function TrendChart({
  points,
  height = 240,
  aLabel,
  bLabel,
  format: fmt,
  valueFormat: vfmt,
}: {
  points: TrendPoint[];
  height?: number;
  aLabel: string;
  bLabel?: string;
  format?: Fmt;
  valueFormat?: Fmt;
}) {
  const format = resolve(fmt, compact);
  const valueFormat = resolve(vfmt, format);
  const [boxRef, width, seen] = useChartBox();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();
  const hasB = points.some((p) => p.b !== undefined);

  const padL = 44;
  const padB = 26;
  const plotH = height - padB - 10;
  const max = niceMax(Math.max(0, ...points.map((p) => Math.max(p.a, p.b ?? 0))));
  const n = points.length;
  const xAt = (i: number) => padL + (n <= 1 ? (width - padL) / 2 : (i / (n - 1)) * (width - padL - 6));
  const yAt = (v: number) => 10 + plotH - (v / max) * plotH;

  const line = (key: "a" | "b") => points.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p[key] ?? 0).toFixed(1)}`).join(" ");
  const pathA = useMemo(() => (width ? line("a") : ""), [width, points]); // eslint-disable-line react-hooks/exhaustive-deps
  const pathB = useMemo(() => (width && hasB ? line("b") : ""), [width, points, hasB]); // eslint-disable-line react-hooks/exhaustive-deps
  const area = pathA && n > 1 ? `${pathA} L${xAt(n - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z` : "";
  const showEvery = Math.ceil(n / Math.max(1, Math.floor((width - padL) / 52)));
  const drawn = seen || reduced;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + padL;
    const i = n <= 1 ? 0 : Math.round(((x - padL) / (width - padL - 6)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div ref={boxRef} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${aLabel} trend`}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={width} y1={yAt(f * max)} y2={yAt(f * max)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={padL - 8} y={yAt(f * max) + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
                {format(f * max)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            // Every few labels, plus the last; skip one that would crowd the last.
            (i % showEvery === 0 && n - 1 - i >= Math.max(2, showEvery * 0.7)) || i === n - 1 ? (
              <text key={i} x={xAt(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-ink-3 text-[11px]">
                {p.label}
              </text>
            ) : null,
          )}
          {area && <path d={area} fill={`url(#${gradId})`} style={{ opacity: drawn ? 1 : 0, transition: reduced ? undefined : "opacity 900ms ease 300ms" }} />}
          {pathB && (
            <path
              d={pathB}
              fill="none"
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={drawn ? 0 : 1}
              style={{ transition: reduced ? undefined : "stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          )}
          {pathA && (
            <path
              d={pathA}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={drawn ? 0 : 1}
              style={{ transition: reduced ? undefined : "stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1) 120ms" }}
            />
          )}
          {n > 0 && drawn && (
            <circle cx={xAt(n - 1)} cy={yAt(points[n - 1]!.a)} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} className="animate-fade" style={{ animationDelay: "1s" }} />
          )}
          {hover !== null && points[hover] && (
            <g pointerEvents="none">
              <line x1={xAt(hover)} x2={xAt(hover)} y1={10} y2={10 + plotH} stroke="var(--ink-3)" strokeWidth={1} />
              {hasB && <circle cx={xAt(hover)} cy={yAt(points[hover].b ?? 0)} r={4} fill="var(--chart-2)" stroke="var(--surface)" strokeWidth={2} />}
              <circle cx={xAt(hover)} cy={yAt(points[hover].a)} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
          <rect
            x={padL}
            y={0}
            width={Math.max(0, width - padL)}
            height={10 + plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${aLabel}: hover or use arrow keys for values`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover((h) => h ?? n - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
            }}
            className="outline-none"
          />
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tooltip x={xAt(hover)} y={yAt(Math.max(points[hover].a, points[hover].b ?? 0))} width={width}>
          <p className="mb-1 text-ink-3">{points[hover].title ?? points[hover].label}</p>
          <p className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-chart-1" />
            <span className="font-semibold tabular-nums">{valueFormat(points[hover].a)}</span>
            <span className="text-ink-3">{aLabel}</span>
          </p>
          {hasB && (
            <p className="mt-0.5 flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 rounded-full bg-chart-2" />
              <span className="font-semibold tabular-nums">{valueFormat(points[hover].b ?? 0)}</span>
              <span className="text-ink-3">{bLabel}</span>
            </p>
          )}
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Ranked horizontal bars ----------

export interface BarRow {
  label: string;
  value: number;
  /** Shown under the label (e.g. "12 orders · 40 shutters"). */
  sub?: string;
  /** Muted (e.g. a product that hasn't sold). */
  muted?: boolean;
}

export function BarList({ rows, format: fmt, empty = "Nothing to show yet" }: { rows: BarRow[]; format?: Fmt; empty?: string }) {
  const format = resolve(fmt, FORMATS.number);
  const [ref, seen] = useInView<HTMLUListElement>();
  const reduced = useReducedMotion();
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">{empty}</p>;
  return (
    <ul ref={ref} className="space-y-3">
      {rows.map((r, i) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        return (
          <li key={r.label} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={cx("min-w-0 truncate", r.muted ? "text-ink-3" : "font-medium")}>{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{format(r.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" title={`${r.label}: ${format(r.value)}`}>
              <div
                className="h-full rounded-full bg-chart-1 transition-[width,opacity] group-hover:opacity-80"
                style={{
                  width: seen || reduced ? `${Math.max(pct, r.value > 0 ? 1.5 : 0)}%` : "0%",
                  transitionDuration: reduced ? "0ms" : "800ms",
                  transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                  transitionDelay: reduced ? "0ms" : `${i * 60}ms`,
                }}
              />
            </div>
            {r.sub && <p className="mt-1 text-[12px] text-ink-3">{r.sub}</p>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Stat tile ----------

export function StatTile({
  label,
  value,
  format,
  delta,
  hint,
  tone,
  delay = 0,
  empty = false,
}: {
  label: string;
  value: number;
  format?: Fmt;
  delta?: { value: number; label: string; goodWhenUp?: boolean } | null;
  hint?: string;
  tone?: "warn" | "bad";
  delay?: number;
  /** No value to show yet: renders a dash instead of 0. */
  empty?: boolean;
}) {
  const up = delta && delta.value > 0;
  const good = delta ? (delta.goodWhenUp ?? true) === up : false;
  return (
    <div style={{ animationDelay: `${delay}ms` }} className="animate-rise rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-[13px] text-ink-2">{label}</p>
      {empty ? (
        <span className="mt-1.5 block text-[26px] font-semibold tracking-tight text-ink-3 sm:text-[28px]">—</span>
      ) : (
        <CountUp value={value} format={format} className={cx("mt-1.5 block text-[26px] font-semibold tracking-tight sm:text-[28px]", tone === "bad" && value > 0 && "text-bad", tone === "warn" && value > 0 && "text-warn")} />
      )}
      {delta && Number.isFinite(delta.value) ? (
        <p className="mt-1 text-[12.5px]">
          <span className={cx("font-medium", delta.value === 0 ? "text-ink-3" : good ? "text-good" : "text-bad")}>
            {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "•"} {Math.abs(Math.round(delta.value))}%
          </span>{" "}
          <span className="text-ink-3">{delta.label}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** % change from `before` to `now`, or null when there's nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / before) * 100;
}
