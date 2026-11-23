"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "../ui";
import { useUrlState } from "../url-state";

/** Search box that updates ?q= after a short pause. */
export function VendorSearch({ initial, placeholder = "Search by name, code, GSTIN or contact" }: { initial: string; placeholder?: string }) {
  const { set } = useUrlState();
  const [q, setQ] = useState(initial);
  useEffect(() => {
    if (q === initial) return;
    const t = setTimeout(() => set({ q: q.trim() || null }), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative max-w-md">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" aria-label="Search" />
    </div>
  );
}
