import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, UserRound } from "lucide-react";
import { LoadError } from "@/components/no-access";
import { OverviewView, type OverviewData } from "@/components/overview/overview-view";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Overview" };

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const me = await requireMe();
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  const profileIncomplete = !me.phone || !me.bloodGroup || !me.emergencyPhone || !me.photoUrl;
  const res = await apiGet<OverviewData>("/v1/overview");

  return (
    <>
      <div className="mb-7">
        <p className="text-sm text-ink-3">{today}</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight sm:text-[32px]">
          {greeting()}, {me.name.split(" ")[0]}
        </h1>
      </div>

      {profileIncomplete && (
        <Link href="/settings" className="animate-rise mb-6 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <UserRound size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Complete your profile</p>
            <p className="text-[13px] text-ink-2">Add your photo, phone, blood group and an emergency contact.</p>
          </div>
          <ArrowUpRight size={18} className="shrink-0 text-ink-3" />
        </Link>
      )}

      {res.ok ? <OverviewView data={res.data} /> : <LoadError message={res.error.error} />}
    </>
  );
}
