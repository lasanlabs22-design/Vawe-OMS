import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { canEdit, canView, PAYMENT_TERM_LABELS, type Followup, type VendorListItem } from "@vawe/shared";
import { StatTile } from "@/components/charts";
import { LoadError, NoAccess } from "@/components/no-access";
import { Badge, Card, PageHeader } from "@/components/ui";
import { cx } from "@/lib/cx";
import { PendingFrame, Tabs, UrlStateProvider } from "@/components/url-state";
import { HealthBadge } from "@/components/vendors/vendor-bits";
import { AddFollowupButton, FollowupList } from "@/components/vendors/followups";
import { VendorSearch } from "@/components/vendors/vendor-search";
import { VendorsOverview } from "@/components/vendors/vendors-overview";
import { money, phone } from "@/lib/format";
import { dayLabel } from "@/lib/dates";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Vendors" };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "all", label: "All vendors" },
  { value: "attention", label: "Needs attention" },
  { value: "followups", label: "Communication" },
];

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const me = await requireMe();
  if (!canView(me, "vendor")) return <NoAccess module="vendor" />;
  const editable = canEdit(me, "vendor");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "overview";

  const [vendors, followups, people] = await Promise.all([
    apiGet<VendorListItem[]>("/v1/vendors"),
    apiGet<Followup[]>("/v1/followups?status=open"),
    apiGet<{ id: string; name: string }[]>("/v1/assignees"),
  ]);
  if (!vendors.ok) return <LoadError message={vendors.error.error} />;

  const all = vendors.data.filter((v) => !v.isWalkIn || v.stats.orders > 0);
  const q = sp.q?.trim().toLowerCase();
  const shown = q ? all.filter((v) => [v.firmName, v.code, v.gstin, v.contact1Name].some((s) => s?.toLowerCase().includes(q))) : all;
  const outstanding = all.reduce((s, v) => s + v.stats.outstanding, 0);
  const overdue = all.reduce((s, v) => s + v.stats.overdue, 0);
  const attention = all.filter((v) => v.stats.health === "at_risk" || v.stats.health === "watch").sort((a, b) => b.stats.maxDaysOverdue - a.stats.maxDaysOverdue);
  const open = followups.ok ? followups.data : [];
  const peopleList = people.ok ? people.data : [];

  return (
    <UrlStateProvider>
      <PageHeader title="Vendors" description="B2B vendors, what they owe and how they pay.">
        {editable && (
          <Link href="/vendors/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-solid px-4 text-sm font-medium text-on-solid shadow-sm hover:bg-solid/85">
            <Plus size={17} /> Add vendor
          </Link>
        )}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendors" value={all.filter((v) => v.isActive && !v.isWalkIn).length} hint="Active" />
        <StatTile label="Outstanding" value={outstanding} format="moneyShort" hint="Owed to Vawe" delay={60} />
        <StatTile label="Overdue" value={overdue} format="moneyShort" tone="bad" hint="Past the due date" delay={120} />
        <StatTile label="Open follow-ups" value={open.length} hint={`${attention.length} vendor${attention.length === 1 ? "" : "s"} need attention`} delay={180} />
      </div>

      <Tabs tabs={TABS} value={tab} />

      <PendingFrame>
        {tab === "overview" && <VendorsOverview vendors={all} followups={open} />}

        {tab === "all" && (
          <>
            <div className="mb-4">
              <VendorSearch initial={sp.q ?? ""} />
            </div>
            <VendorTable vendors={shown} />
          </>
        )}

        {tab === "attention" && (
          <Card className="divide-y divide-line">
            {attention.length === 0 && <p className="p-6 text-center text-sm text-ink-3">Every vendor is paying on time.</p>}
            {attention.map((v) => {
              const hasOpen = open.some((f) => f.vendorId === v.id);
              return (
                <div key={v.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/vendors/${v.id}`} className="font-semibold hover:text-brand">
                        {v.firmName}
                      </Link>
                      <HealthBadge health={v.stats.health} />
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-2">
                      {money(v.stats.overdue)} overdue
                      {v.stats.maxDaysOverdue > 0 && `, oldest ${v.stats.maxDaysOverdue} days`}
                      {v.stats.onTimeRate !== null && ` · ${Math.round(v.stats.onTimeRate * 100)}% paid on time`}
                      {v.contact1Phone && ` · ${v.contact1Name ?? "Contact"} ${phone(v.contact1Phone)}`}
                    </p>
                  </div>
                  {hasOpen ? (
                    <Badge tone="neutral">Follow-up planned</Badge>
                  ) : (
                    editable && <AddFollowupButton vendorId={v.id} vendorName={v.firmName} people={peopleList} size="sm" suggestedReason={`Chase ${money(v.stats.overdue)} overdue`} label="Plan follow-up" />
                  )}
                </div>
              );
            })}
          </Card>
        )}

        {tab === "followups" && (
          <Card>
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h3 className="font-semibold">Who to talk to</h3>
              <p className="text-[13px] text-ink-3">Open follow-ups, earliest first. Add one from a vendor's page or from "Needs attention".</p>
            </div>
            <FollowupList items={open} canEdit={editable} showVendor />
          </Card>
        )}
      </PendingFrame>
    </UrlStateProvider>
  );
}

function VendorTable({ vendors }: { vendors: VendorListItem[] }) {
  if (!vendors.length) return <Card className="p-8 text-center text-sm text-ink-3">No vendors match.</Card>;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2.5 font-medium sm:px-5">Vendor</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Terms</th>
              <th className="px-3 py-2.5 font-medium">Health</th>
              <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
              <th className="px-4 py-2.5 text-right font-medium sm:px-5">Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {vendors.map((v) => (
              <tr key={v.id} className={cx("group transition-colors hover:bg-surface-2/60", !v.isActive && "opacity-60")}>
                <td className="px-4 py-3 sm:px-5">
                  <Link href={`/vendors/${v.id}`} className="font-medium group-hover:text-brand">
                    {v.firmName}
                  </Link>
                  <p className="text-[12px] text-ink-3">
                    {v.code}
                    {v.gstin && ` · ${v.gstin}`}
                    {!v.isActive && " · Inactive"}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p>{v.contact1Name ?? "—"}</p>
                  <p className="text-[12px] text-ink-3">{phone(v.contact1Phone)}</p>
                </td>
                <td className="px-3 py-3 text-ink-2">
                  {PAYMENT_TERM_LABELS[v.paymentTerms]}
                  <p className="text-[12px] text-ink-3">{v.pricingModel.toUpperCase()} pricing</p>
                </td>
                <td className="px-3 py-3">
                  <HealthBadge health={v.stats.health} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <p className="font-medium">{money(v.stats.outstanding)}</p>
                  {v.stats.overdue > 0 && <p className="text-[12px] text-bad">{money(v.stats.overdue)} overdue</p>}
                </td>
                <td className="px-4 py-3 text-right text-ink-2 sm:px-5">{v.stats.lastOrderDate ? dayLabel(v.stats.lastOrderDate) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
