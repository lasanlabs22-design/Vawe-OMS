import type { Metadata } from "next";
import Link from "next/link";
import {
  canEdit,
  canView,
  EXPENSE_LABELS,
  PAYMENT_METHOD_LABELS,
  STAGE_LABELS,
  type ExpenseView,
  type FinanceSummary,
  type PaymentView,
  type PurchaseView,
  type Receivable,
  type ReturnView,
} from "@vawe/shared";
import { StatTile } from "@/components/charts";
import { AddExpense, AddPurchase, AddReturn, DeleteRow, RecordPayment } from "@/components/finance/finance-forms";
import { FinanceOverview } from "@/components/finance/finance-overview";
import { LoadError, NoAccess } from "@/components/no-access";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DateRange, PendingFrame, Tabs, UrlStateProvider } from "@/components/url-state";
import { cx } from "@/lib/cx";
import { dayLabel, isDay, monthStart, rangePresets, todayIST } from "@/lib/dates";
import { money } from "@/lib/format";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Finance" };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "receivables", label: "To be received" },
  { value: "payments", label: "Payments received" },
  { value: "expenses", label: "Expenses" },
  { value: "returns", label: "Returns" },
  { value: "purchases", label: "Purchases" },
];

type Search = { tab?: string; from?: string; to?: string; record?: string; category?: string };

export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireMe();
  if (!canView(me, "finance")) return <NoAccess module="finance" />;
  const editable = canEdit(me, "finance");
  // Deleting a payment or expense entered by mistake: admins with Finance edit.
  const isAdmin = me.role === "admin" && editable;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "overview";
  const today = todayIST();
  const to = isDay(sp.to) ? sp.to : today;
  const from = isDay(sp.from) ? sp.from : monthStart(today);
  const range = `from=${from}&to=${to}`;
  const rangePicker = <DateRange from={from} to={to} presets={rangePresets(today)} />;

  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (tab === "overview") {
    const [summary, exps] = await Promise.all([apiGet<FinanceSummary>(`/v1/finance/summary?${range}`), apiGet<ExpenseView[]>(`/v1/expenses?${range}`)]);
    if (!summary.ok) return <LoadError message={summary.error.error} />;
    const s = summary.data;
    const production = s.daily.map((d) => ({
      date: d.date,
      value: exps.ok ? exps.data.filter((e) => e.category === "production" && e.spentOn === d.date).reduce((t, e) => t + e.amount, 0) : 0,
    }));
    body = (
      <div className="space-y-5">
        {rangePicker}
        <FinanceOverview s={s} production={production} />
      </div>
    );
  } else if (tab === "receivables") {
    const res = await apiGet<Receivable[]>("/v1/finance/receivables");
    if (!res.ok) return <LoadError message={res.error.error} />;
    const delivered = res.data.filter((r) => r.stage === "delivered");
    body = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="To be received" value={res.data.reduce((s, r) => s + r.outstanding, 0)} format="moneyShort" hint={`${res.data.length} orders`} />
          <StatTile label="Delivered, not paid" value={delivered.reduce((s, r) => s + r.outstanding, 0)} format="moneyShort" hint={`${delivered.length} orders`} tone="warn" delay={60} />
          <StatTile label="Overdue" value={res.data.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.outstanding, 0)} format="moneyShort" tone="bad" hint="Past the due date" delay={120} />
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium sm:px-5">Order</th>
                  <th className="px-3 py-2.5 font-medium">Vendor</th>
                  <th className="px-3 py-2.5 font-medium">Stage</th>
                  <th className="px-3 py-2.5 font-medium">Due</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">Owing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {res.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-ink-3">
                      Nothing owed. Every order is paid.
                    </td>
                  </tr>
                )}
                {res.data.map((r) => (
                  <tr key={r.orderId}>
                    <td className="px-4 py-3 font-medium tabular-nums sm:px-5">
                      {canView(me, "order") ? (
                        <Link href={`/orders/${r.orderId}`} className="hover:text-brand">
                          {r.orderCode}
                        </Link>
                      ) : (
                        r.orderCode
                      )}
                    </td>
                    <td className="px-3 py-3">{r.vendorName}</td>
                    <td className="px-3 py-3 text-ink-2">{STAGE_LABELS[r.stage]}</td>
                    <td className="px-3 py-3">
                      {r.dueDate ? (
                        <>
                          {dayLabel(r.dueDate)}
                          {r.daysOverdue > 0 && (
                            <span className="ml-2">
                              <Badge tone={r.daysOverdue > 30 ? "bad" : "warn"}>{r.daysOverdue} days late</Badge>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-3">After delivery</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(r.total)}</td>
                    <td className={cx("px-4 py-3 text-right font-semibold tabular-nums sm:px-5", r.daysOverdue > 0 && "text-bad")}>{money(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
    if (editable) actions = <RecordPayment />;
  } else if (tab === "payments") {
    const res = await apiGet<PaymentView[]>(`/v1/payments?${range}`);
    if (!res.ok) return <LoadError message={res.error.error} />;
    body = (
      <div className="space-y-4">
        {rangePicker}
        <LedgerTable
          total={res.data.reduce((s, p) => s + p.amount, 0)}
          rows={res.data.map((p) => ({
            id: p.id,
            date: p.paidOn,
            title: `${p.orderCode} · ${p.vendorName}`,
            sub: [PAYMENT_METHOD_LABELS[p.method], p.reference, p.note, p.recordedByName && `by ${p.recordedByName}`].filter(Boolean).join(" · "),
            amount: p.amount,
            del: isAdmin ? `/v1/payments/${p.id}` : undefined,
          }))}
          empty="No payments in this range."
          tone="good"
        />
      </div>
    );
    if (editable) actions = <RecordPayment initialOrderId={sp.record} />;
  } else if (tab === "expenses") {
    const res = await apiGet<ExpenseView[]>(`/v1/expenses?${range}`);
    if (!res.ok) return <LoadError message={res.error.error} />;
    const list = sp.category ? res.data.filter((e) => e.category === sp.category) : res.data;
    body = (
      <div className="space-y-4">
        {rangePicker}
        <div className="flex flex-wrap gap-1.5">
          {[{ v: "", l: "All" }, ...Object.entries(EXPENSE_LABELS).map(([v, l]) => ({ v, l }))].map((c) => (
            <Link
              key={c.v}
              href={`/finance?tab=expenses&${range}${c.v ? `&category=${c.v}` : ""}`}
              className={cx("rounded-full border px-3 py-1 text-[13px]", (sp.category ?? "") === c.v ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}
            >
              {c.l}
            </Link>
          ))}
        </div>
        <LedgerTable
          total={list.reduce((s, e) => s + e.amount, 0)}
          rows={list.map((e) => ({
            id: e.id,
            date: e.spentOn,
            title: `${EXPENSE_LABELS[e.category]}${e.orderCode ? ` · ${e.orderCode}` : ""}`,
            sub: [e.description, e.recordedByName && `by ${e.recordedByName}`].filter(Boolean).join(" · "),
            amount: e.amount,
            del: isAdmin ? `/v1/expenses/${e.id}` : undefined,
          }))}
          empty="No expenses in this range."
          tone="bad"
        />
      </div>
    );
    if (editable) actions = <AddExpense defaultCategory={(sp.category as never) ?? "production"} />;
  } else if (tab === "returns") {
    const res = await apiGet<ReturnView[]>(`/v1/returns?${range}`);
    if (!res.ok) return <LoadError message={res.error.error} />;
    body = (
      <div className="space-y-4">
        {rangePicker}
        <LedgerTable
          total={res.data.reduce((s, r) => s + r.amount, 0)}
          rows={res.data.map((r) => ({
            id: r.id,
            date: r.returnedOn,
            title: `${r.orderCode} · ${r.vendorName}`,
            sub: [r.reason, r.items, r.recordedByName && `by ${r.recordedByName}`].filter(Boolean).join(" · "),
            amount: r.amount,
          }))}
          empty="No returns in this range."
        />
      </div>
    );
    if (editable) actions = <AddReturn />;
  } else {
    const res = await apiGet<PurchaseView[]>(`/v1/purchases?${range}`);
    if (!res.ok) return <LoadError message={res.error.error} />;
    body = (
      <div className="space-y-4">
        {rangePicker}
        <LedgerTable
          total={res.data.reduce((s, p) => s + p.amount, 0)}
          rows={res.data.map((p) => ({
            id: p.id,
            date: p.purchasedOn,
            title: `${p.supplierName}${p.invoiceNo ? ` · ${p.invoiceNo}` : ""}`,
            sub: [p.description, p.recordedByName && `by ${p.recordedByName}`].filter(Boolean).join(" · "),
            amount: p.amount,
          }))}
          empty="No purchases in this range."
        />
      </div>
    );
    if (editable) actions = <AddPurchase />;
  }

  return (
    <UrlStateProvider>
      <PageHeader title="Finance" description="Money in, money owed and what each order and day costs.">
        {editable && tab === "overview" ? (
          <>
            <RecordPayment />
            <AddExpense />
          </>
        ) : (
          actions
        )}
      </PageHeader>
      <Tabs tabs={TABS} value={tab} />
      <PendingFrame>{body}</PendingFrame>
    </UrlStateProvider>
  );
}

function LedgerTable({
  rows,
  total,
  empty,
  tone,
}: {
  rows: { id: string; date: string; title: string; sub: string; amount: number; del?: string }[];
  total: number;
  empty: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-2">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </p>
        <p className="font-semibold tabular-nums">{money(total)}</p>
      </div>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <time className="w-16 shrink-0 text-[13px] text-ink-3">{dayLabel(r.date)}</time>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                {r.sub && <p className="truncate text-[12.5px] text-ink-3">{r.sub}</p>}
              </div>
              <p className={cx("shrink-0 font-semibold tabular-nums", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{money(r.amount)}</p>
              {r.del && <DeleteRow path={r.del} label="this entry" />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
