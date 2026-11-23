"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/lib/cx";

// Filters live in the URL (so a view can be bookmarked or shared, and Back works). Changing one
// re-renders the server page; while it loads, the content keeps its frame at reduced opacity.

const PendingContext = createContext<{ pending: boolean; set: (updates: Record<string, string | null>) => void } | null>(null);

export function UrlStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return <PendingContext.Provider value={{ pending, set }}>{children}</PendingContext.Provider>;
}

export function useUrlState() {
  const ctx = useContext(PendingContext);
  const params = useSearchParams();
  if (!ctx) throw new Error("useUrlState needs <UrlStateProvider>");
  return { ...ctx, get: (k: string) => params.get(k) };
}

/** Wraps content that reloads when filters change: dims instead of flashing. */
export function PendingFrame({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(PendingContext);
  return <div className={cx("transition-opacity duration-200", ctx?.pending && "pointer-events-none opacity-55", className)}>{children}</div>;
}

export function Tabs({ name = "tab", tabs, value }: { name?: string; tabs: { value: string; label: string }[]; value: string }) {
  const { set } = useUrlState();
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => set({ [name]: t.value === tabs[0]!.value ? null : t.value })}
          className={cx(
            "h-9 shrink-0 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === t.value ? "bg-solid text-on-solid shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A date range with quick presets. Values are "YYYY-MM-DD". */
export function DateRange({
  from,
  to,
  presets,
  fromKey = "from",
  toKey = "to",
}: {
  from: string;
  to: string;
  presets?: { label: string; from: string; to: string }[];
  fromKey?: string;
  toKey?: string;
}) {
  const { set } = useUrlState();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets?.map((p) => {
        const active = p.from === from && p.to === to;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => set({ [fromKey]: p.from, [toKey]: p.to })}
            className={cx(
              "h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors",
              active ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {p.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2">
        <input
          type="date"
          aria-label="From"
          value={from}
          max={to}
          onChange={(e) => e.target.value && set({ [fromKey]: e.target.value })}
          className="h-9 bg-transparent text-[13px] outline-none"
        />
        <span className="text-ink-3">→</span>
        <input
          type="date"
          aria-label="To"
          value={to}
          min={from}
          onChange={(e) => e.target.value && set({ [toKey]: e.target.value })}
          className="h-9 bg-transparent text-[13px] outline-none"
        />
      </div>
    </div>
  );
}
