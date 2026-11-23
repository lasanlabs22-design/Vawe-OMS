import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Pencil, Phone } from "lucide-react";
import { canEdit, canView, PAYMENT_TERM_LABELS, RATE_FIELDS, type Rates, type VendorDetail } from "@vawe/shared";
import { ChartCard, ColumnChart, StatTile, TrendChart } from "@/components/charts";
import { LoadError, NoAccess } from "@/components/no-access";
import { OrderTable } from "@/components/orders/order-bits";
import { Badge, Card } from "@/components/ui";
import { AddFollowupButton, FollowupList } from "@/components/vendors/followups";
import { HealthBadge } from "@/components/vendors/vendor-bits";
import { monthLabel, monthLong, dayLabel } from "@/lib/dates";
import { money, phone } from "@/lib/format";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!canView(me, "vendor")) return <NoAccess module="vendor" />;
  const { id } = await params;
  const [res, defaults, people] = await Promise.all([apiGet<VendorDetail>(`/v1/vendors/${id}`), apiGet<Rates>("/v1/settings/rates"), apiGet<{ id: string; name: string }[]>("/v1/assignees")]);
  if (!res.ok) return res.status === 404 ? notFound() : <LoadError message={res.error.error} />;
  const v = res.data;
  const editable = canEdit(me, "vendor");
  const s = v.stats;
  const defaultRates = defaults.ok ? defaults.data : {};
  const rateRows = RATE_FIELDS.filter((f) => (v.pricingModel === "rft" ? f.group !== "SQFT" : f.group !== "RFT" && f.key !== "makingCharge"));

  return (
    <>
      <Link href="/vendors" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Vendors
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {v.firmName} <HealthBadge health={s.health} />
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {v.code}
            {v.gstin && ` · GSTIN ${v.gstin}`}
            {v.state && ` · ${v.state}`}
            {!v.isActive && " · Inactive"}
          </p>
        </div>
        <div className="flex gap-2">
          {editable && <AddFollowupButton vendorId={v.id} vendorName={v.firmName} people={people.ok ? people.data : []} />}
          {editable && (
            <Link href={`/vendors/${v.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
              <Pencil size={15} /> Edit
            </Link>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Billed" value={s.billed} format="moneyShort" hint={`${s.orders} order${s.orders === 1 ? "" : "s"}`} />
        <StatTile label="Outstanding" value={s.outstanding} format="moneyShort" hint={s.overdue > 0 ? `${money(s.overdue)} overdue` : "Nothing overdue"} delay={60} />
        <StatTile label="Paid on time" value={(s.onTimeRate ?? 0) * 100} format="percent" empty={s.onTimeRate === null} hint="Of orders that fell due" delay={120} />
        <StatTile label="Average delay" value={s.avgDaysLate ?? 0} format="days" empty={s.avgDaysLate === null} hint={s.maxDaysOverdue > 0 ? `Oldest overdue: ${s.maxDaysOverdue} days` : "Past the due date"} tone={s.avgDaysLate && s.avgDaysLate > 15 ? "warn" : undefined} delay={180} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Purchase trend"
          subtitle="Order value by month, last 12 months"
          table={{ columns: ["Month", "Orders", "Value", "Paid"], rows: v.monthly.map((m) => [monthLong(m.month), m.orders, money(m.value), money(m.paid)]) }}
        >
          <ColumnChart data={v.monthly.map((m, i) => ({ label: monthLabel(m.month), value: m.value, highlight: i === v.monthly.length - 1, tooltip: `${monthLong(m.month)} · ${m.orders} orders` }))} valueFormat="money" />
        </ChartCard>
        <ChartCard
          title="Billed vs paid"
          subtitle="By month"
          legend={[
            { label: "Billed", color: "var(--chart-1)" },
            { label: "Paid", color: "var(--chart-2)" },
          ]}
        >
          <TrendChart points={v.monthly.map((m) => ({ label: monthLabel(m.month), a: m.value, b: m.paid, title: monthLong(m.month) }))} aLabel="billed" bLabel="paid" valueFormat="money" />
        </ChartCard>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold">Contacts</h2>
          {[
            { name: v.contact1Name, phone: v.contact1Phone, email: v.contact1Email, label: "Primary" },
            { name: v.contact2Name, phone: v.contact2Phone, email: v.contact2Email, label: "Second" },
          ]
            .filter((c) => c.name || c.phone || c.email)
            .map((c) => (
              <div key={c.label} className="mt-4">
                <p className="text-[12px] text-ink-3">{c.label}</p>
                <p className="font-medium">{c.name ?? "—"}</p>
                {c.phone && (
                  <a href={`tel:+91${c.phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-brand hover:underline">
                    <Phone size={13} /> {phone(c.phone)}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="mt-1 flex items-center gap-1.5 text-sm text-brand hover:underline">
                    <Mail size={13} /> {c.email}
                  </a>
                )}
              </div>
            ))}
          {!v.contact1Name && !v.contact1Phone && !v.contact2Name && <p className="mt-3 text-sm text-ink-3">No contacts yet.</p>}
          {(v.legalName || v.address) && (
            <div className="mt-5 border-t border-line pt-4 text-sm">
              {v.legalName && <p className="font-medium">{v.legalName}</p>}
              {v.address && <p className="text-ink-2">{v.address}</p>}
              <p className="mt-1 text-[12px] text-ink-3">{v.branches} branch{v.branches === 1 ? "" : "es"}</p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Terms</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[12px] text-ink-3">Payment</dt>
              <dd className="font-medium">
                {PAYMENT_TERM_LABELS[v.paymentTerms]}
                {v.paymentTerms === "custom" && v.paymentDays !== null && ` (${v.paymentDays} days)`}
              </dd>
              {v.paymentNote && <dd className="text-ink-2">{v.paymentNote}</dd>}
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">Delivery</dt>
              <dd>{v.deliveryTerms ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">Discount</dt>
              <dd>{v.discountPercent ? `${v.discountPercent}% on every estimate` : "None"}</dd>
            </div>
            {v.remarks && (
              <div>
                <dt className="text-[12px] text-ink-3">Remarks</dt>
                <dd className="text-ink-2">{v.remarks}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            Pricing <Badge tone="neutral">{v.pricingModel.toUpperCase()}</Badge>
          </h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            {rateRows.map((f) => {
              const own = v.rates[f.key];
              const fallback = defaultRates[f.key];
              return (
                <div key={f.key} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-ink-2">
                    {f.group !== "Other" && <span className="text-ink-3">{f.group} · </span>}
                    {f.label}
                  </dt>
                  <dd className="tabular-nums">
                    {own !== undefined ? <span className="font-medium">₹{own}</span> : fallback !== undefined ? <span className="text-ink-3">₹{fallback} default</span> : <span className="text-ink-3">—</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </div>

      <Card className="mb-5">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-semibold">Communication</h2>
          <p className="text-[13px] text-ink-3">Follow-ups planned for this vendor</p>
        </div>
        <FollowupList items={v.followups} canEdit={editable} />
      </Card>

      <h2 className="mb-3 font-semibold">Recent orders</h2>
      <OrderTable orders={v.recentOrders} showVendor={false} empty="No orders from this vendor yet." />
      {s.lastOrderDate && <p className="mt-3 text-[13px] text-ink-3">Last order on {dayLabel(s.lastOrderDate)}.</p>}
    </>
  );
}
