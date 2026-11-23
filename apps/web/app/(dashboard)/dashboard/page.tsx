import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, UserRound } from "lucide-react";
import { accessFor } from "@vawe/shared";
import { AccessBadge, MODULE_PLAN } from "@/components/module-page";
import { Card } from "@/components/ui";
import { MODULE_NAV } from "@/lib/modules";
import { requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Overview" };

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const me = await requireMe();
  const modules = MODULE_NAV.filter((n) => n.module && accessFor(me, n.module) !== "none");
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  const profileIncomplete = !me.phone || !me.bloodGroup || !me.emergencyPhone || !me.photoUrl;

  return (
    <>
      <div className="mb-8">
        <p className="text-sm text-ink-3">{today}</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item, i) => {
          const Icon = item.icon;
          const module = item.module!;
          return (
            <Link key={item.href} href={item.href} style={{ animationDelay: `${i * 70}ms` }} className="group animate-rise">
              <Card className="h-full p-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-brand/40 group-hover:shadow-lg group-hover:shadow-brand/5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand transition-transform duration-300 group-hover:scale-105">
                    <Icon size={21} />
                  </span>
                  <AccessBadge me={me} module={module} />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{item.label}</h2>
                <p className="mt-1 text-sm text-ink-2">{MODULE_PLAN[module].description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
