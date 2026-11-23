import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, PauseCircle, Pencil, Phone } from "lucide-react";
import { canEdit, canView, EXPENSE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TERM_LABELS, paymentTermsText, SOURCE_LABELS, sourceDetailLabel, STAGE_LABELS, type OrderDetail } from "@vawe/shared";
import { LoadError, NoAccess } from "@/components/no-access";
import { OrderActions, StageTrack } from "@/components/orders/order-actions";
import { StageBadge } from "@/components/orders/order-bits";
import { ShutterSketch } from "@/components/orders/shutter-sketch";
import { Alert, Card } from "@/components/ui";
import { dayLabel, dayLong } from "@/lib/dates";
import { dateTime, money, moneyExact, number, phone } from "@/lib/format";
import { apiGet, requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!canView(me, "order")) return <NoAccess module="order" />;
  const { id } = await params;
  const res = await apiGet<OrderDetail>(`/v1/orders/${id}`);
  if (!res.ok) return res.status === 404 ? notFound() : <LoadError message={res.error.error} />;
  const o = res.data;
  const editable = canEdit(me, "order");
  const seeFinance = canView(me, "finance");

  return (
    <>
      <Link href="/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Orders
      </Link>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight tabular-nums">
            {o.code} <StageBadge stage={o.stage} onHold={o.onHold} />
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            <Link href={`/vendors/${o.vendorId}`} className="font-medium hover:text-brand">
              {o.vendorName}
            </Link>
            {o.projectName && ` · ${o.projectName}`}
            {o.location && ` · ${o.location}`} · ordered {dayLabel(o.orderDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/orders/${o.id}/dwg`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            <FileText size={16} /> DWG & job card
          </Link>
          {editable && o.stage !== "cancelled" && (
            <Link href={`/orders/${o.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
              <Pencil size={15} /> Edit
            </Link>
          )}
        </div>
      </div>

      {o.stage === "cancelled" && (
        <div className="mb-5">
          <Alert>Cancelled{o.cancelReason ? `: ${o.cancelReason}` : ""}.</Alert>
        </div>
      )}
      {o.onHold && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <PauseCircle size={18} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">On hold for procurement</span>
            {o.holdReason && `: ${o.holdReason}`}
            {o.heldAt && <span className="opacity-80"> · since {dateTime(o.heldAt)}</span>}
          </p>
        </div>
      )}

      {o.stage !== "cancelled" && (
        <Card className="mb-5 p-5">
          <StageTrack order={o} />
          {editable && (
            <div className="mt-5 border-t border-line pt-4">
              <OrderActions order={o} />
            </div>
          )}
        </Card>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold">Customer & project</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Item label="Customer" value={o.customerName} extra={o.customerPhone && <PhoneLink n={o.customerPhone} />} />
            <Item label="Project" value={o.projectName} />
            <Item label="Location" value={o.location} />
            <Item label="Project manager" value={o.pmName} extra={o.pmPhone && <PhoneLink n={o.pmPhone} />} />
            <Item label="Came from" value={`${SOURCE_LABELS[o.source]}${o.sourceDetail ? ` · ${sourceDetailLabel(o.source, o.sourceDetail)}` : ""}`} />
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Dates</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Item label="Ordered" value={dayLong(o.orderDate)} />
            <Item label="Expected delivery" value={o.expectedDelivery ? dayLong(o.expectedDelivery) : null} />
            <Item label="Delivered" value={o.deliveredAt ? dateTime(o.deliveredAt) : null} />
            <Item label="Payment due" value={o.dueDate ? `${dayLong(o.dueDate)} (${PAYMENT_TERM_LABELS[o.vendorPaymentTerms]})` : paymentTermsText(o.vendorPaymentTerms)} />
            <Item label="Created" value={`${dateTime(o.createdAt)}${o.createdByName ? ` by ${o.createdByName}` : ""}`} />
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Money</h2>
          <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
            <Money label="Subtotal" value={o.subtotal} />
            {o.discountAmount > 0 && <Money label={`Discount ${o.discountPercent}%`} value={-o.discountAmount} />}
            <Money label={`GST ${o.gstPercent}%`} value={o.gstAmount} />
            <div className="flex justify-between border-t border-line pt-2 font-semibold">
              <dt>Total</dt>
              <dd>{moneyExact(o.total)}</dd>
            </div>
            <Money label="Paid" value={o.paid} />
            {o.credited > 0 && <Money label="Return credit" value={o.credited} />}
            <div className="flex justify-between pt-1 font-semibold">
              <dt>Balance</dt>
              <dd className={o.balance > 0 ? "text-bad" : "text-good"}>{o.balance > 0 ? moneyExact(o.balance) : "Paid in full"}</dd>
            </div>
          </dl>
          {seeFinance && o.balance > 0 && o.stage !== "cancelled" && (
            <Link href={`/finance?tab=payments&record=${o.id}`} className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-strong">
              Record a payment
            </Link>
          )}
        </Card>
      </div>

      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-semibold">Items</h2>
          <p className="text-[13px] text-ink-3">
            {o.items.length} item{o.items.length === 1 ? "" : "s"} · {o.shutters} shutter{o.shutters === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="divide-y divide-line">
          {o.items.map((it) => (
            <li key={it.id} className="grid gap-4 p-4 sm:grid-cols-[180px_1fr] sm:p-5">
              <div className="flex items-center justify-center rounded-xl bg-surface-2/60 p-2">
                <ShutterSketch item={it} size={120} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {it.position}. {it.orderType}
                  </p>
                  <p className="font-semibold tabular-nums">{money(it.amount)}</p>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                  <Spec label="Size" value={`${it.widthMm} × ${it.heightMm} mm`} />
                  <Spec label="Shutters" value={`${it.quantity} · ${number(it.sqft, 1)} sq ft`} />
                  <Spec label="Profile" value={`${it.frameType} ${it.frameColour}`} />
                  <Spec label="Glass" value={it.glassType} />
                  <Spec label="Handle" value={`${it.handleType} · ${it.handlePosition}`} />
                  <Spec label="Divider" value={it.divider} />
                  {it.family === "profile_shutter" && <Spec label="Hinge holes" value={String(it.hingeHoles)} />}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Estimate breakdown</h2>
          {!o.pricing ? (
            <p className="mt-3 text-sm text-ink-3">No estimate.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {o.pricing.groups.map((g) => (
                <div key={g.key} className="text-[13px]">
                  <p className="font-medium">
                    {g.frameType} · {g.handleType} · {g.glassType}
                  </p>
                  {g.lines.map((l) => (
                    <p key={l.label} className="flex justify-between gap-2 text-ink-2 tabular-nums">
                      <span>
                        {l.label}: {number(l.quantity, 2)} {l.unit} × ₹{l.rate}
                      </span>
                      <span>{money(l.amount)}</span>
                    </p>
                  ))}
                </div>
              ))}
              {o.pricing.warnings.map((w) => (
                <p key={w} className="text-[12.5px] text-warn">
                  {w}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Materials needed</h2>
          <p className="mt-1 text-[13px] text-ink-3">Worked out from the items (profiles include 10% wastage).</p>
          <dl className="mt-4 space-y-2 text-sm">
            {o.materials.profiles.map((p) => (
              <Spec key={p.name} label={`Profile ${p.name}`} value={`${number(p.rft, 1)} r ft`} row />
            ))}
            {o.materials.glass.map((g) => (
              <Spec key={g.name} label={g.name} value={`${number(g.sqft, 1)} sq ft`} row />
            ))}
            {o.materials.handles.map((h) => (
              <Spec key={h.name} label={h.name} value={`${h.count} pcs`} row />
            ))}
            {o.materials.hinges > 0 && <Spec label="Hinges" value={`${o.materials.hinges} pcs`} row />}
          </dl>
        </Card>
      </div>

      {(o.payments.length > 0 || o.returns.length > 0 || o.expenses.length > 0) && seeFinance && (
        <Card className="mb-5 overflow-hidden">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-semibold">Payments, returns and costs</h2>
          </div>
          <ul className="divide-y divide-line text-sm">
            {o.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span>
                  Payment · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference && ` · ${p.reference}`} <span className="text-ink-3">· {dayLabel(p.paidOn)}</span>
                </span>
                <span className="font-medium text-good tabular-nums">{money(p.amount)}</span>
              </li>
            ))}
            {o.returns.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span>
                  Return · {r.reason} <span className="text-ink-3">· {dayLabel(r.returnedOn)}</span>
                </span>
                <span className="font-medium tabular-nums">{money(r.amount)} credit</span>
              </li>
            ))}
            {o.expenses.map((x) => (
              <li key={x.id} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span>
                  {EXPENSE_LABELS[x.category]}
                  {x.description && ` · ${x.description}`} <span className="text-ink-3">· {dayLabel(x.spentOn)}</span>
                </span>
                <span className="font-medium text-bad tabular-nums">− {money(x.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-semibold">History</h2>
        </div>
        <ol className="relative px-4 py-4 sm:px-5">
          {o.events.map((e, i) => (
            <li key={e.id} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }} className="animate-rise relative flex gap-3 pb-4 last:pb-0">
              <span className="relative mt-1.5 flex size-2.5 shrink-0 rounded-full bg-chart-1 ring-4 ring-brand-soft" />
              {i < o.events.length - 1 && <span aria-hidden className="absolute top-4 left-[4.5px] h-full w-px bg-line" />}
              <div className="min-w-0 text-sm">
                <p>
                  {e.kind === "stage" && e.toStage ? (
                    <>
                      Moved to <span className="font-medium">{STAGE_LABELS[e.toStage]}</span>
                    </>
                  ) : e.kind === "created" ? (
                    "Order created"
                  ) : e.kind === "hold" ? (
                    <>
                      <span className="font-medium text-warn">Put on hold</span>
                      {e.note && `: ${e.note}`}
                    </>
                  ) : e.kind === "release" ? (
                    <>
                      <span className="font-medium">Hold released</span>
                      {e.note && `: ${e.note}`}
                    </>
                  ) : e.kind === "cancelled" ? (
                    <>
                      <span className="font-medium text-bad">Cancelled</span>
                      {e.note && `: ${e.note}`}
                    </>
                  ) : (
                    e.note
                  )}
                  {e.kind === "stage" && e.note && <span className="text-ink-2"> · {e.note}</span>}
                </p>
                <p className="text-[12px] text-ink-3">
                  {dateTime(e.createdAt)}
                  {e.userName && ` · ${e.userName}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function Item({ label, value, extra }: { label: string; value: string | null | undefined; extra?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="flex flex-wrap items-center gap-x-3">
        <span>{value || "—"}</span>
        {extra}
      </dd>
    </div>
  );
}

function PhoneLink({ n }: { n: string }) {
  return (
    <a href={`tel:+91${n}`} className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline">
      <Phone size={12} /> {phone(n)}
    </a>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-ink-2">
      <dt>{label}</dt>
      <dd>{value < 0 ? `− ${moneyExact(-value)}` : moneyExact(value)}</dd>
    </div>
  );
}

function Spec({ label, value, row }: { label: string; value: string; row?: boolean }) {
  return row ? (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  ) : (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
