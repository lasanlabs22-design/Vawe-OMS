"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui";
import { useUrlState } from "../url-state";
import { todayIST } from "@/lib/dates";

export function ActivityMonth({ month }: { month: string }) {
  const { set } = useUrlState();
  return (
    <input
      type="month"
      aria-label="Month"
      value={month}
      max={todayIST().slice(0, 7)}
      onChange={(e) => e.target.value && set({ month: e.target.value, page: null })}
      className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px]"
    />
  );
}

export function ActivityPager({ page, pages }: { page: number; pages: number }) {
  const { set } = useUrlState();
  if (pages <= 1) return null;
  const go = (p: number) => {
    set({ page: p === 1 ? null : String(p) });
    window.scrollTo({ top: 0 });
  };
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
      <Button variant="secondary" onClick={() => go(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={16} aria-hidden /> Newer
      </Button>
      <span className="text-[13px] text-ink-3">
        Page {page} of {pages}
      </span>
      <Button variant="secondary" onClick={() => go(page + 1)} disabled={page >= pages}>
        Older <ChevronRight size={16} aria-hidden />
      </Button>
    </nav>
  );
}
