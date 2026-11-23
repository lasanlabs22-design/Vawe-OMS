"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Plus, Trash2 } from "lucide-react";
import {
  HINGE_HOLE_OPTIONS,
  ORDER_SOURCES,
  SOURCE_DETAILS,
  SOURCE_LABELS,
  type Catalog,
  type Estimate,
  type OrderDetail,
  type OrderSource,
} from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { todayIST } from "@/lib/dates";
import { money, moneyExact, number } from "@/lib/format";
import { Alert, Button, Card, cx, Field, Input, Select } from "../ui";
import { ShutterSketch } from "./shutter-sketch";

type VendorOption = { id: string; code: string; firmName: string; isWalkIn: boolean; pricingModel: string };

type ItemDraft = {
  key: number;
  orderType: string;
  frameType: string;
  frameColour: string;
  glassType: string;
  widthMm: string;
  heightMm: string;
  handlePosition: string;
  handleType: string;
  divider: string;
  hingeHoles: string;
  quantity: string;
};

const SLIDING_DIVIDERS = ["Top Only", "Bottom Only", "Top and Bottom", "Double Center Line", "No Divider"];

function blankItem(catalog: Catalog, key: number, from?: Partial<ItemDraft>): ItemDraft {
  const ot = catalog.orderTypes.find((o) => o.isActive)!;
  return {
    key,
    orderType: ot?.name ?? "",
    frameType: catalog.frameTypes.find((f) => f.isActive)?.name ?? "",
    frameColour: catalog.frameColours.find((f) => f.isActive)?.name ?? "",
    glassType: catalog.glassTypes.find((f) => f.isActive)?.name ?? "",
    widthMm: "",
    heightMm: "",
    handlePosition: "Right",
    handleType: ot?.handleTypes.find((h) => h.isActive)?.name ?? "",
    divider: "No Divider",
    hingeHoles: "4",
    quantity: "1",
    ...from,
    key,
  };
}

export function OrderForm({ catalog, vendors, order }: { catalog: Catalog; vendors: VendorOption[]; order?: OrderDetail }) {
  const router = useRouter();
  const walkIn = vendors.find((v) => v.isWalkIn);
  const [vendorId, setVendorId] = useState(order?.vendorId ?? "");
  const [details, setDetails] = useState({
    customerName: order?.customerName ?? "",
    customerPhone: order?.customerPhone ?? "",
    projectName: order?.projectName ?? "",
    location: order?.location ?? "",
    pmName: order?.pmName ?? "",
    pmPhone: order?.pmPhone ?? "",
    source: (order?.source ?? "") as OrderSource | "",
    sourceDetail: order?.sourceDetail ?? "",
    orderDate: order?.orderDate ?? todayIST(),
    expectedDelivery: order?.expectedDelivery ?? "",
    notes: order?.notes ?? "",
  });
  // Item keys (and the field ids built from them) must match between the server render and the
  // browser, so the first ones are their positions; later ones come from a per-form counter.
  const nextKey = useRef(1000);
  const newKey = () => nextKey.current++;
  const [items, setItems] = useState<ItemDraft[]>(() =>
    order
      ? order.items.map((i, n) => ({
          key: n + 1,
          orderType: i.orderType,
          frameType: i.frameType,
          frameColour: i.frameColour,
          glassType: i.glassType,
          widthMm: String(i.widthMm),
          heightMm: String(i.heightMm),
          handlePosition: i.handlePosition,
          handleType: i.handleType,
          divider: i.divider,
          hingeHoles: String(i.hingeHoles),
          quantity: String(i.quantity),
        }))
      : [blankItem(catalog, 1)],
  );
  const [estimate, setEstimate] = useState<Estimate | null>(order?.pricing ?? null);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lockedItems = !!order && !["design", "qa", "dwg_confirmation", "estimate_confirmation", "awaiting_payment"].includes(order.stage);

  const setD = (k: keyof typeof details, v: string) => setDetails((d) => ({ ...d, [k]: v }));

  // Walk-in and social-media orders are usually direct customers.
  useEffect(() => {
    if (!order && !vendorId && walkIn && (details.source === "direct_walkin" || details.source === "social_media")) setVendorId(walkIn.id);
  }, [details.source]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateItem(key: number, patch: Partial<ItemDraft>) {
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        const ot = catalog.orderTypes.find((o) => o.name === next.orderType);
        // Handle types belong to the order type.
        if (patch.orderType && ot && !ot.handleTypes.some((h) => h.name === next.handleType)) next.handleType = ot.handleTypes.find((h) => h.isActive)?.name ?? "";
        // The workbook's rules, applied as you type.
        if (["top", "bottom"].includes(next.handlePosition.toLowerCase())) next.divider = "No Divider";
        if (ot?.family === "sliding" && !SLIDING_DIVIDERS.includes(next.divider)) next.divider = "No Divider";
        return next;
      }),
    );
  }

  // Live estimate, a moment after typing stops.
  const payload = useMemo(() => ({ vendorId, items: items.map(({ key: _k, ...i }) => i) }), [vendorId, items]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current && order) {
      firstRun.current = false;
      return;
    }
    if (!vendorId) return setEstimate(null);
    const t = setTimeout(async () => {
      setEstimating(true);
      try {
        setEstimate(await api<Estimate>("POST", "/v1/orders/estimate", payload));
      } catch {
        /* the form shows errors on save */
      } finally {
        setEstimating(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { vendorId, ...details, items: payload.items };
      const saved = order ? await api<OrderDetail>("PATCH", `/v1/orders/${order.id}`, body) : await api<OrderDetail>("POST", "/v1/orders", body);
      router.push(`/orders/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? { message: err.message, field: err.body.field } : { message: "Couldn't save the order" });
      setBusy(false);
    }
  }

  const shutters = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const sourceDetails = details.source ? SOURCE_DETAILS[details.source] : undefined;
  const itemError = (i: number) => (error?.field === `items.${i}` || error?.field?.startsWith(`items.${i}.`) ? error.message : null);

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
      <div className="min-w-0 space-y-5">
        {error && !error.field?.startsWith("items.") && <Alert>{error.message}</Alert>}

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Order details</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Where did this order come from?" htmlFor="source" error={error?.field === "source" ? error.message : undefined}>
              <Select id="source" value={details.source} onChange={(e) => setDetails((d) => ({ ...d, source: e.target.value as OrderSource, sourceDetail: "" }))}>
                <option value="">Choose…</option>
                {ORDER_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            {sourceDetails ? (
              <Field label="Which one?" htmlFor="sourceDetail">
                <Select id="sourceDetail" value={details.sourceDetail} onChange={(e) => setD("sourceDetail", e.target.value)}>
                  <option value="">Choose…</option>
                  {sourceDetails.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Field label="Vendor" htmlFor="vendorId" error={error?.field === "vendorId" ? error.message : undefined} hint={lockedItems ? "Can't change once production has started" : "Their prices are used for the estimate"}>
              <Select id="vendorId" value={vendorId} onChange={(e) => setVendorId(e.target.value)} disabled={lockedItems}>
                <option value="">Choose a vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.isWalkIn ? v.firmName : `${v.firmName} (${v.code})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Customer name" htmlFor="customerName" optional>
              <Input id="customerName" value={details.customerName} onChange={(e) => setD("customerName", e.target.value)} />
            </Field>
            <Field label="Project name" htmlFor="projectName" optional>
              <Input id="projectName" value={details.projectName} onChange={(e) => setD("projectName", e.target.value)} />
            </Field>
            <Field label="Location" htmlFor="location" optional>
              <Input id="location" value={details.location} onChange={(e) => setD("location", e.target.value)} />
            </Field>
            <Field label="Project manager" htmlFor="pmName" optional>
              <Input id="pmName" value={details.pmName} onChange={(e) => setD("pmName", e.target.value)} />
            </Field>
            <Field label="Project manager's number" htmlFor="pmPhone" optional error={error?.field === "pmPhone" ? error.message : undefined}>
              <Input id="pmPhone" type="tel" inputMode="tel" value={details.pmPhone} onChange={(e) => setD("pmPhone", e.target.value)} />
            </Field>
            <Field label="Order date" htmlFor="orderDate">
              <Input id="orderDate" type="date" value={details.orderDate} onChange={(e) => setD("orderDate", e.target.value)} />
            </Field>
            <Field label="Expected delivery" htmlFor="expectedDelivery" optional hint="Blank: 2 working days after the order date">
              <Input id="expectedDelivery" type="date" value={details.expectedDelivery} min={details.orderDate} onChange={(e) => setD("expectedDelivery", e.target.value)} />
            </Field>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Items <span className="font-normal text-ink-3">· {items.length} item{items.length === 1 ? "" : "s"}, {shutters} shutter{shutters === 1 ? "" : "s"}</span>
          </h2>
        </div>
        {lockedItems && <Alert tone="warn">Production has started, so items are locked. Move the order back before production to change them.</Alert>}

        {items.map((it, index) => {
          const ot = catalog.orderTypes.find((o) => o.name === it.orderType);
          const sliding = ot?.family === "sliding";
          const handleLocksDivider = ["top", "bottom"].includes(it.handlePosition.toLowerCase());
          const dividers = catalog.dividers.filter((d) => (d.isActive || d.name === it.divider) && (!sliding || SLIDING_DIVIDERS.includes(d.name)));
          const opts = <T extends { name: string; isActive: boolean }>(list: T[], current: string) => list.filter((o) => o.isActive || o.name === current);
          const err = itemError(index);
          return (
            <Card key={it.key} className={cx("animate-rise p-4 sm:p-5", err && "border-bad")}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">
                  Item {index + 1}
                  {ot && <span className="ml-2 font-normal text-ink-3">{sliding ? "Sliding" : "Profile shutter"}</span>}
                </p>
                {!lockedItems && (
                  <div className="flex gap-1">
                    <button type="button" className="rounded-md p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Duplicate item ${index + 1}`} onClick={() => setItems((l) => [...l.slice(0, index + 1), { ...it, key: newKey() }, ...l.slice(index + 1)])}>
                      <Copy size={16} />
                    </button>
                    {items.length > 1 && (
                      <button type="button" className="rounded-md p-2 text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label={`Remove item ${index + 1}`} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {err && (
                <div className="mb-4">
                  <Alert>{err}</Alert>
                </div>
              )}
              <fieldset disabled={lockedItems} className="grid gap-4 2xl:grid-cols-[1fr_auto]">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Order type" htmlFor={`ot-${it.key}`}>
                    <Select id={`ot-${it.key}`} value={it.orderType} onChange={(e) => updateItem(it.key, { orderType: e.target.value })}>
                      {opts(catalog.orderTypes, it.orderType).map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Frame type" htmlFor={`ft-${it.key}`}>
                    <Select id={`ft-${it.key}`} value={it.frameType} onChange={(e) => updateItem(it.key, { frameType: e.target.value })}>
                      {opts(catalog.frameTypes, it.frameType).map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Frame colour" htmlFor={`fc-${it.key}`}>
                    <Select id={`fc-${it.key}`} value={it.frameColour} onChange={(e) => updateItem(it.key, { frameColour: e.target.value })}>
                      {opts(catalog.frameColours, it.frameColour).map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Glass type" htmlFor={`gt-${it.key}`}>
                    <Select id={`gt-${it.key}`} value={it.glassType} onChange={(e) => updateItem(it.key, { glassType: e.target.value })}>
                      {opts(catalog.glassTypes, it.glassType).map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Width (mm)" htmlFor={`w-${it.key}`}>
                    <Input id={`w-${it.key}`} type="number" inputMode="numeric" min={50} value={it.widthMm} onChange={(e) => updateItem(it.key, { widthMm: e.target.value })} placeholder="e.g. 600" />
                  </Field>
                  <Field label="Height (mm)" htmlFor={`h-${it.key}`}>
                    <Input id={`h-${it.key}`} type="number" inputMode="numeric" min={50} value={it.heightMm} onChange={(e) => updateItem(it.key, { heightMm: e.target.value })} placeholder="e.g. 2100" />
                  </Field>
                  <Field label="Handle" htmlFor={`hp-${it.key}`}>
                    <Select id={`hp-${it.key}`} value={it.handlePosition} onChange={(e) => updateItem(it.key, { handlePosition: e.target.value })}>
                      {opts(catalog.handlePositions, it.handlePosition).map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Handle type" htmlFor={`ht-${it.key}`}>
                    <Select id={`ht-${it.key}`} value={it.handleType} onChange={(e) => updateItem(it.key, { handleType: e.target.value })}>
                      {opts(ot?.handleTypes ?? [], it.handleType).map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Divider" htmlFor={`dv-${it.key}`} hint={handleLocksDivider ? "No divider with a top/bottom handle" : undefined}>
                    <Select id={`dv-${it.key}`} value={it.divider} onChange={(e) => updateItem(it.key, { divider: e.target.value })} disabled={handleLocksDivider}>
                      {dividers.map((o) => (
                        <option key={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Hinge holes" htmlFor={`hh-${it.key}`}>
                    <Select id={`hh-${it.key}`} value={it.hingeHoles} onChange={(e) => updateItem(it.key, { hingeHoles: e.target.value })}>
                      {HINGE_HOLE_OPTIONS.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="No. of shutters" htmlFor={`q-${it.key}`}>
                    <Input id={`q-${it.key}`} type="number" inputMode="numeric" min={1} value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: e.target.value })} />
                  </Field>
                  {estimate?.itemAmounts[index] !== undefined && (
                    <div className="flex flex-col justify-end pb-2 text-right">
                      <p className="text-[12px] text-ink-3">{number(estimate.itemSqft[index] ?? 0, 1)} sq ft</p>
                      <p className="font-semibold tabular-nums">{money(estimate.itemAmounts[index])}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-center rounded-xl bg-surface-2/60 p-2 2xl:w-56">
                  {Number(it.widthMm) > 0 && Number(it.heightMm) > 0 && ot ? (
                    <ShutterSketch item={{ family: ot.family, widthMm: Number(it.widthMm), heightMm: Number(it.heightMm), handlePosition: it.handlePosition, handleType: it.handleType, divider: it.divider, hingeHoles: Number(it.hingeHoles), quantity: Number(it.quantity) || 1 }} size={130} />
                  ) : (
                    <p className="p-6 text-center text-[13px] text-ink-3">Enter the width and height to see the drawing</p>
                  )}
                </div>
              </fieldset>
            </Card>
          );
        })}

        {!lockedItems && (
          <Button type="button" variant="secondary" className="w-full border-dashed" onClick={() => setItems((l) => [...l, blankItem(catalog, newKey(), l.length ? { ...l[l.length - 1], key: undefined, widthMm: "", heightMm: "", quantity: "1" } : {})])}>
            <Plus size={17} /> Add item
          </Button>
        )}

        <Card className="p-5 sm:p-6">
          <Field label="Notes" htmlFor="notes" optional>
            <textarea id="notes" rows={3} value={details.notes} onChange={(e) => setD("notes", e.target.value)} className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none" />
          </Field>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Estimate</h2>
            {estimating && <span className="text-[12px] text-ink-3">Updating…</span>}
          </div>
          {!vendorId ? (
            <p className="mt-3 text-sm text-ink-3">Choose a vendor to see the price.</p>
          ) : !estimate || estimate.groups.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">Fill in an item's size to see the price.</p>
          ) : (
            <div className={cx("mt-4 space-y-3 transition-opacity", estimating && "opacity-60")}>
              {estimate.groups.map((g) => (
                <div key={g.key} className="text-[13px]">
                  <p className="font-medium">
                    {g.frameType} · {g.glassType}
                  </p>
                  {g.lines.map((l) => (
                    <p key={l.label} className="flex justify-between gap-2 text-ink-2">
                      <span className="min-w-0 truncate">
                        {l.label}: {number(l.quantity, 2)} {l.unit} × ₹{l.rate}
                      </span>
                      <span className="shrink-0 tabular-nums">{money(l.amount)}</span>
                    </p>
                  ))}
                </div>
              ))}
              <dl className="space-y-1 border-t border-line pt-3 text-sm tabular-nums">
                <Row label="Subtotal" value={moneyExact(estimate.subtotal)} />
                {estimate.discountAmount > 0 && <Row label={`Discount ${estimate.discountPercent}%`} value={`− ${moneyExact(estimate.discountAmount)}`} />}
                <Row label={`GST ${estimate.gstPercent}%`} value={moneyExact(estimate.gstAmount)} />
                <div className="flex justify-between pt-1 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{moneyExact(estimate.total)}</dd>
                </div>
              </dl>
              {estimate.warnings.map((w) => (
                <p key={w} className="flex gap-1.5 text-[12.5px] text-warn">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}
          <Button type="submit" className="mt-5 w-full" size="lg" loading={busy} disabled={!vendorId || !details.source}>
            {order ? "Save changes" : "Create order"}
          </Button>
          <p className="mt-2 text-center text-[12px] text-ink-3">1 sq ft is added per group of matching items, as in the workbook.</p>
        </Card>
      </aside>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-2">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
