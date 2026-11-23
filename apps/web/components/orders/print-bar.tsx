"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "../ui";

export function PrintBar({ backHref, title }: { backHref: string; title: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-[900px] items-center gap-3 px-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={15} /> Back
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer size={15} /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
