import type { Metadata } from "next";
import type { ActivityEntry, ActivityPage } from "@vawe/shared";
import { ActivityMonth, ActivityPager } from "@/components/ops/activity-controls";
import { Alert, Card, PageHeader } from "@/components/ui";
import { PendingFrame, UrlStateProvider } from "@/components/url-state";
import { monthLong, todayIST } from "@/lib/dates";
import { apiGet, requireOpsMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Activity · Ops" };

function describe(e: ActivityEntry): string {
  const who = e.actorName ?? "Someone";
  const whom = e.targetName ?? "an account";
  const meta = e.meta ?? {};
  switch (e.action) {
    case "auth.login":
      return `${who} signed in${meta.scope === "ops" ? " to the ops console" : ""}`;
    case "auth.login_failed":
      return meta.reason === "unknown_email" ? `Failed sign-in for unknown email ${String(meta.email ?? "")}` : `Failed sign-in for ${whom}`;
    case "auth.locked_out":
      return `${whom} was locked out for 15 minutes after 5 wrong passwords`;
    case "auth.password_changed":
      return `${who} changed their password`;
    case "profile.updated":
      return `${who} updated their profile`;
    case "profile.photo_changed":
      return meta.removed ? `${who} removed their photo` : `${who} changed their photo`;
    case "user.created":
      return `${who} added ${whom} as ${meta.role === "admin" ? "an admin" : "staff"}`;
    case "user.updated":
      return `${who} changed ${whom}'s ${Object.keys(meta).join(", ")}`;
    case "user.password_reset":
      return `${who} reset ${whom}'s password`;
    case "user.deactivated":
      return `${who} deactivated ${whom}`;
    case "user.reactivated":
      return `${who} reactivated ${whom}`;
    default:
      return `${who}: ${e.action}`;
  }
}

const tone = (action: string) =>
  action.includes("failed") || action.includes("locked") || action.includes("deactivated") ? "bg-bad" : action.startsWith("user.") ? "bg-brand" : "bg-ink-3";

const TZ = "Asia/Kolkata";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const dayHeading = (iso: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
const timeOnly = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

/** Consecutive entries grouped by India-time day (entries arrive newest first). */
function byDay(entries: ActivityEntry[]) {
  const groups: { day: string; entries: ActivityEntry[] }[] = [];
  for (const e of entries) {
    const day = dayKey(e.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}

export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  await requireOpsMe();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayIST().slice(0, 7);
  const page = /^\d+$/.test(sp.page ?? "") ? sp.page : "1";
  const log = await apiGet<ActivityPage>(`/ops/activity?month=${month}&page=${page}`);

  return (
    <UrlStateProvider>
      <PageHeader title="Activity" description="Sign-ins, failed attempts and every change to people and access. One month at a time, newest first." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ActivityMonth month={month} />
        {log.ok && (
          <span className="text-[13px] text-ink-3">
            {log.data.total} {log.data.total === 1 ? "entry" : "entries"} in {monthLong(month)}
          </span>
        )}
      </div>
      {!log.ok ? (
        <Alert>{log.error.error}</Alert>
      ) : (
        <PendingFrame>
          <Card className="divide-y divide-line">
            {log.data.entries.length === 0 && <p className="p-5 text-sm text-ink-3">Nothing in {monthLong(month)}.</p>}
            {byDay(log.data.entries).map((g) => (
              <section key={g.day} className="divide-y divide-line">
                <h2 className="bg-surface-2 px-4 py-2 text-[13px] font-medium text-ink-2 sm:px-5">{dayHeading(g.entries[0]!.createdAt)}</h2>
                {g.entries.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone(e.action)}`} />
                    <p className="min-w-0 flex-1 text-sm">{describe(e)}</p>
                    <time className="shrink-0 text-[13px] text-ink-3" dateTime={e.createdAt}>
                      {timeOnly(e.createdAt)}
                    </time>
                  </div>
                ))}
              </section>
            ))}
          </Card>
          <ActivityPager page={log.data.page} pages={log.data.pages} />
        </PendingFrame>
      )}
    </UrlStateProvider>
  );
}
