import type { Metadata } from "next";
import type { ActivityEntry } from "@vawe/shared";
import { Alert, Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
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

export default async function ActivityPage() {
  await requireOpsMe();
  const log = await apiGet<ActivityEntry[]>("/ops/activity?limit=200");

  return (
    <>
      <PageHeader title="Activity" description="Sign-ins, failed attempts and every change to people and access. Newest first." />
      {!log.ok ? (
        <Alert>{log.error.error}</Alert>
      ) : (
        <Card className="divide-y divide-line">
          {log.data.length === 0 && <p className="p-5 text-sm text-ink-3">Nothing yet.</p>}
          {log.data.map((e) => (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone(e.action)}`} />
              <p className="min-w-0 flex-1 text-sm">{describe(e)}</p>
              <time className="shrink-0 text-[13px] text-ink-3" dateTime={e.createdAt}>
                {dateTime(e.createdAt)}
              </time>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
