"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";

// Picture-first visuals for the Overview. Each one animates in when it scrolls into view (and not
// at all under reduced motion), keeps a label beside every colour, and shows exact values on
// hover or focus so nothing depends on colour or hovering alone.

function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

const EASE = "cubic-bezier(0.22,1,0.36,1)";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

// ---------- Donut ----------

/** Parts of a whole as a ring. The centre shows the total, or the hovered part. */
export function Donut({
  slices,
  size = 168,
  thickness = 20,
  center,
  format = (n) => n.toLocaleString("en-IN"),
  stacked = false,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: { value: string; label: string };
  format?: (n: number) => string;
  /** Legend under the ring instead of beside it (for narrow cards). */
  stacked?: boolean;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 3 : 0; // surface gap between parts
  let offset = 0;
  const h = hover !== null ? slices[hover] : null;

  return (
    <div ref={ref} className={cx("flex flex-col items-center gap-4", !stacked && "sm:flex-row sm:items-center")}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={slices.map((s) => `${s.label}: ${format(s.value)}`).join(", ")}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (s.value / total) * circ;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === i ? thickness + 4 : thickness}
                  strokeDasharray={`${seen ? dash : 0} ${circ}`}
                  strokeDashoffset={-offset}
                  style={{ transition: `stroke-dasharray 900ms ${EASE} ${i * 140}ms, stroke-width 150ms` }}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              );
              offset += len;
              return s.value > 0 ? el : null;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold tracking-tight">{h ? format(h.value) : (center?.value ?? format(total))}</span>
          <span className="max-w-[70%] text-[11.5px] leading-tight text-ink-3">{h ? h.label : (center?.label ?? "Total")}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.label}>
            <button
              type="button"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={cx("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors", hover === i && "bg-surface-2")}
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
              <span className="font-semibold tabular-nums">{format(s.value)}</span>
              <span className="w-9 text-right text-[12px] text-ink-3 tabular-nums">{total ? `${Math.round((s.value / total) * 100)}%` : "0%"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Ring gauge ----------

/** How far along something is (0–1+), as a ring filling up. */
export function Ring({ ratio, size = 132, thickness = 12, value, label, color = "var(--chart-1)" }: { ratio: number; size?: number; thickness?: number; value: string; label: string; color?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, ratio));
  return (
    <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${seen ? shown * circ : 0} ${circ}`}
          style={{ transition: `stroke-dasharray 1100ms ${EASE}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-semibold tracking-tight">{value}</span>
        <span className="max-w-[75%] text-[11px] leading-tight text-ink-3">{label}</span>
      </div>
    </div>
  );
}

// ---------- Segmented bar ----------

/** One whole split into parts, left to right. Each part grows in; names and amounts in the legend. */
export function SegmentedBar({ parts, format = (n) => n.toLocaleString("en-IN") }: { parts: Slice[]; format?: (n: number) => string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div ref={ref}>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md bg-surface-2" role="img" aria-label={parts.map((p) => `${p.label}: ${format(p.value)}`).join(", ")}>
        {total > 0 &&
          parts.map((p, i) =>
            p.value > 0 ? (
              <div
                key={p.label}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                className="h-full first:rounded-l-md last:rounded-r-md"
                style={{
                  background: p.color,
                  width: seen ? `${(p.value / total) * 100}%` : "0%",
                  opacity: hover === null || hover === i ? 1 : 0.45,
                  transition: `width 900ms ${EASE} ${i * 120}ms, opacity 150ms`,
                }}
              />
            ) : null,
          )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {parts.map((p, i) => (
          <li key={p.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.label}</span>
            <span className="font-semibold tabular-nums">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Waffle ----------

/** One tile per thing (e.g. per vendor), coloured by its state. Tiles pop in one after another. */
export function Waffle({ tiles, legend }: { tiles: { label: string; color: string }[]; legend: { label: string; color: string; count: number }[] }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref}>
      <div className="flex flex-wrap gap-1.5" role="img" aria-label={legend.map((l) => `${l.label}: ${l.count}`).join(", ")}>
        {tiles.map((t, i) => (
          <span
            key={`${t.label}-${i}`}
            title={t.label}
            className="size-5 rounded-[5px] transition-[transform,opacity] hover:scale-125"
            style={{
              background: t.color,
              transform: seen ? "scale(1)" : "scale(0)",
              opacity: seen ? 1 : 0,
              transitionDuration: "450ms",
              transitionTimingFunction: EASE,
              transitionDelay: `${Math.min(i, 60) * 22}ms`,
            }}
          />
        ))}
        {tiles.length === 0 && <p className="text-sm text-ink-3">Nothing yet.</p>}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5 text-[13px]">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: l.color }} />
            <span className="text-ink-2">{l.label}</span>
            <span className="font-semibold tabular-nums">{l.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Calendar heatmap ----------

/** Days as squares in week columns, darker for busier days (one hue, light to dark). */
export function CalendarHeatmap({ days, label = "orders", color = "var(--chart-1)" }: { days: { date: string; count: number }[]; label?: string; color?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [hover, setHover] = useState<{ date: string; count: number } | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  // Pad the start so columns are Monday-to-Sunday weeks.
  const first = days[0] ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 1;
  const lead = (first + 6) % 7;
  const cells: ({ date: string; count: number } | null)[] = [...Array(lead).fill(null), ...days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (n: number) => (n === 0 ? 0 : Math.ceil((n / max) * 4)); // 0–4
  const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  return (
    <div ref={ref}>
      <div className="flex gap-3">
        <div className="grid grid-rows-7 gap-[3px] pt-0 text-[10px] leading-[14px] text-ink-3">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span key={i} className="h-[14px]">
              {d}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 gap-[3px] overflow-x-auto pb-1" role="img" aria-label={`${days.reduce((s, d) => s + d.count, 0)} ${label} over the last ${days.length} days`}>
          {weeks.map((w, wi) => (
            <div key={wi} className="grid grid-rows-7 gap-[3px]">
              {w.map((d, di) =>
                d ? (
                  <span
                    key={d.date}
                    title={`${fmt(d.date)}: ${d.count} ${label}`}
                    onPointerEnter={() => setHover(d)}
                    onPointerLeave={() => setHover(null)}
                    className="size-[14px] rounded-[3px] transition-opacity"
                    style={{
                      background: level(d.count) === 0 ? "var(--surface-2)" : `color-mix(in oklab, ${color} ${[0, 30, 55, 78, 100][level(d.count)]}%, var(--surface))`,
                      opacity: seen ? 1 : 0,
                      transitionDuration: "400ms",
                      transitionDelay: `${(wi + di) * 22}ms`,
                    }}
                  />
                ) : (
                  <span key={`pad-${di}`} className="size-[14px]" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-ink-3">
        <span className="min-h-4">{hover ? `${fmt(hover.date)}: ${hover.count} ${label}` : "Hover a day for details"}</span>
        <span className="flex items-center gap-1">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="size-[11px] rounded-[3px]" style={{ background: l === 0 ? "var(--surface-2)" : `color-mix(in oklab, ${color} ${[0, 30, 55, 78, 100][l]}%, var(--surface))` }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

// ---------- Bullet bars ----------

/** Stock against its reorder level: the bar is stock, the tick is the reorder level. */
export function BulletList({ rows, color = "var(--chart-3)" }: { rows: { label: string; sub?: string; value: number; target: number; unit: string }[]; color?: string }) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  if (!rows.length) return <p className="py-4 text-sm text-ink-3">No reorder levels set yet.</p>;
  return (
    <ul ref={ref} className="space-y-3.5">
      {rows.map((r, i) => {
        const scale = Math.max(r.target * 2, r.value, 1);
        const below = r.value <= r.target;
        return (
          <li key={`${r.label}-${r.sub}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">
                <span className="font-medium">{r.label}</span>
                {r.sub && <span className="text-ink-3"> · {r.sub}</span>}
              </span>
              <span className={cx("shrink-0 font-semibold tabular-nums", below && "text-warn")}>
                {r.value} <span className="font-normal text-ink-3">/ {r.target} {r.unit}</span>
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-surface-2" role="img" aria-label={`${r.label}: ${r.value} in stock, reorder at ${r.target}`}>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: below ? "var(--warn)" : color,
                  width: seen ? `${Math.min(100, (r.value / scale) * 100)}%` : "0%",
                  transition: `width 900ms ${EASE} ${i * 90}ms`,
                }}
              />
              <div aria-hidden className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink" style={{ left: `${(r.target / scale) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Stage flow ----------

/** Orders sitting at each stage, as a row of rising columns joined by a baseline. */
export function StageFlow({ stages, groups }: { stages: { label: string; count: number; href?: string; color: string }[]; groups: { label: string; span: number; color: string }[] }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div ref={ref} className="overflow-x-auto">
      <div className="min-w-[620px]">
        <div className="flex items-end gap-1.5" style={{ height: 120 }}>
          {stages.map((s, i) => (
            <a key={s.label} href={s.href} title={`${s.label}: ${s.count}`} className="group flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[13px] font-semibold tabular-nums">{s.count}</span>
              <span
                className="w-full max-w-9 rounded-t-[5px] transition-opacity group-hover:opacity-80"
                style={{
                  background: s.count ? s.color : "var(--surface-2)",
                  height: seen ? `${Math.max(s.count ? 8 : 3, (s.count / max) * 80)}px` : "0px",
                  transition: `height 800ms ${EASE} ${i * 55}ms`,
                }}
              />
            </a>
          ))}
        </div>
        <div className="flex gap-1.5 border-t border-line pt-1.5">
          {stages.map((s) => (
            <span key={s.label} className="line-clamp-2 flex-1 text-center text-[10.5px] leading-tight text-ink-3">
              {s.label}
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          {groups.map((g) => (
            <span key={g.label} style={{ flex: g.span }} className="flex items-center justify-center gap-1.5 rounded-md bg-surface-2 py-1 text-center text-[11px] font-medium text-ink-2">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: g.color }} />
              {g.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VizCard({
  title,
  subtitle,
  children,
  className,
  action,
  icon: Icon,
  tone,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  /** A small coloured chip beside the title, so each card has its own colour. */
  icon?: React.ComponentType<{ size?: number }>;
  tone?: string;
}) {
  return (
    <section className={cx("animate-rise min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && tone && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${tone} 14%, var(--surface))`, color: tone }}>
              <Icon size={18} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
