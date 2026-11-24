"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Scale, Settings2 } from "lucide-react";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_UNITS,
  UNIT_LABELS,
  type InventoryCategory,
  type InventoryItemView,
  type InventoryUnit,
  type InventoryVariantView,
  type OrderOption,
  type SupplierView,
} from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { todayIST } from "@/lib/dates";
import { Alert, Button, Dialog, Field, Input, Select } from "../ui";

function useSave(onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export function AddItem() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("profile");
  const [unit, setUnit] = useState<InventoryUnit>("bar");
  const [colourCount, setColourCount] = useState("");
  const { error, busy, run } = useSave(() => (setOpen(false), setName(""), setColourCount("")));
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add item
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a stock item" description="Then add a stock line for each colour it comes in.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("POST", "/v1/inventory/items", { name, category, unit, colourCount }));
          }}
          className="space-y-4"
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Name" htmlFor="it-name">
            <Input id="it-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 45mm frame" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" htmlFor="it-cat">
              <Select id="it-cat" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
                {INVENTORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {INVENTORY_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Counted in" htmlFor="it-unit">
              <Select id="it-unit" value={unit} onChange={(e) => setUnit(e.target.value as InventoryUnit)}>
                {INVENTORY_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="How many colours" htmlFor="it-colours" optional hint="Leave blank if it has no colours">
            <Input id="it-colours" type="number" min={1} inputMode="numeric" value={colourCount} onChange={(e) => setColourCount(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Add item
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AddColour({ item, suggestions }: { item: InventoryItemView; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const [colour, setColour] = useState("");
  const [openingStock, setOpening] = useState("");
  const [reorderLevel, setReorder] = useState("");
  const [unitCost, setCost] = useState("");
  const { error, busy, run } = useSave(() => (setOpen(false), setColour(""), setOpening(""), setReorder(""), setCost("")));
  const listId = `colours-${item.id}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft">
        <Plus size={13} /> Add colour
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Add a colour: ${item.name}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("POST", `/v1/inventory/items/${item.id}/variants`, { colour, openingStock: openingStock || 0, reorderLevel: reorderLevel || 0, unitCost }));
          }}
          className="space-y-4"
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Colour" htmlFor="v-colour">
            <Input id="v-colour" list={listId} value={colour} onChange={(e) => setColour(e.target.value)} autoFocus />
            <datalist id={listId}>
              {suggestions.filter((s) => !item.variants.some((v) => v.colour === s)).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={`In stock (${UNIT_LABELS[item.unit]})`} htmlFor="v-open">
              <Input id="v-open" type="number" min={0} step="any" inputMode="decimal" value={openingStock} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Reorder at" htmlFor="v-reorder">
              <Input id="v-reorder" type="number" min={0} step="any" inputMode="decimal" value={reorderLevel} onChange={(e) => setReorder(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Cost / unit ₹" htmlFor="v-cost" optional>
              <Input id="v-cost" type="number" min={0} step="any" inputMode="decimal" value={unitCost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!colour.trim()}>
              Add colour
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

type Kind = "in" | "out" | "adjust";
const KIND_TEXT: Record<Kind, { title: string; cta: string }> = {
  in: { title: "Stock in", cta: "Add stock" },
  out: { title: "Stock out", cta: "Take out" },
  adjust: { title: "Recount", cta: "Set stock" },
};

export function MoveStock({ item, variant }: { item: InventoryItemView; variant: InventoryVariantView }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [movedOn, setMovedOn] = useState(todayIST());
  const [orderQ, setOrderQ] = useState("");
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderId, setOrderId] = useState("");
  const [purchases, setPurchases] = useState<{ id: string; supplierName: string; invoiceNo: string | null; purchasedOn: string }[]>([]);
  const [purchaseId, setPurchaseId] = useState("");
  const close = () => (setKind(null), setQty(""), setReason(""), setOrderId(""), setPurchaseId(""), setOrderQ(""));
  const { error, busy, run } = useSave(close);

  useEffect(() => {
    if (kind === "in") api<typeof purchases>("GET", "/v1/purchase-options").then(setPurchases).catch(() => setPurchases([]));
  }, [kind]);
  useEffect(() => {
    if (kind !== "out") return;
    const t = setTimeout(() => {
      api<OrderOption[]>("GET", `/v1/finance/order-options?q=${encodeURIComponent(orderQ)}`).then(setOrders).catch(() => setOrders([]));
    }, 200);
    return () => clearTimeout(t);
  }, [kind, orderQ]);

  const unit = UNIT_LABELS[item.unit];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!kind) return;
    const body =
      kind === "adjust"
        ? { kind, variantId: variant.id, countedStock: qty, reason, movedOn }
        : kind === "in"
          ? { kind, variantId: variant.id, quantity: qty, reason, movedOn, purchaseId: purchaseId || null }
          : { kind, variantId: variant.id, quantity: qty, reason, movedOn, orderId: orderId || null };
    run(() => api("POST", "/v1/inventory/movements", body));
  }

  return (
    <>
      <div className="flex justify-end gap-0.5">
        <button type="button" title="Stock in" aria-label={`Stock in: ${item.name} ${variant.colour}`} onClick={() => setKind("in")} className="rounded-md p-1.5 text-ink-3 hover:bg-good-soft hover:text-good">
          <ArrowDownToLine size={15} />
        </button>
        <button type="button" title="Stock out" aria-label={`Stock out: ${item.name} ${variant.colour}`} onClick={() => setKind("out")} className="rounded-md p-1.5 text-ink-3 hover:bg-bad-soft hover:text-bad">
          <ArrowUpFromLine size={15} />
        </button>
        <button type="button" title="Recount" aria-label={`Recount: ${item.name} ${variant.colour}`} onClick={() => setKind("adjust")} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <Scale size={15} />
        </button>
        <EditLine variant={variant} label={`${item.name} · ${variant.colour}`} />
      </div>
      <Dialog open={!!kind} onClose={close} title={kind ? `${KIND_TEXT[kind].title}: ${item.name} · ${variant.colour}` : ""} description={`In stock now: ${variant.stock} ${unit}`}>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Field label={kind === "adjust" ? `Counted (${unit})` : `Quantity (${unit})`} htmlFor="mv-qty">
              <Input id="mv-qty" type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
            </Field>
            <Field label="Date" htmlFor="mv-date">
              <Input id="mv-date" type="date" value={movedOn} max={todayIST()} onChange={(e) => setMovedOn(e.target.value)} />
            </Field>
          </div>
          {kind === "in" && purchases.length > 0 && (
            <Field label="From purchase" htmlFor="mv-pur" optional>
              <Select id="mv-pur" value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
                <option value="">Not linked</option>
                {purchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.purchasedOn} · {p.supplierName}
                    {p.invoiceNo ? ` · ${p.invoiceNo}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "out" && (
            <Field label="For order" htmlFor="mv-order" optional hint="Link it to see material use per order">
              <Input id="mv-order" value={orderQ} onChange={(e) => (setOrderQ(e.target.value), setOrderId(""))} placeholder="Search order code or vendor" />
              {orders.length > 0 && !orderId && (
                <ul className="mt-1.5 max-h-40 overflow-auto rounded-lg border border-line text-sm">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => (setOrderId(o.id), setOrderQ(`${o.code} · ${o.vendorName}`))}>
                        <span className="font-medium tabular-nums">{o.code}</span> · {o.vendorName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          )}
          <Field label={kind === "adjust" ? "Why the difference" : "Note"} htmlFor="mv-reason" optional={kind !== "adjust"}>
            <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "adjust" ? "e.g. Monthly count, 2 bars damaged" : ""} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!qty || (kind === "adjust" && !reason.trim())}>
              {kind ? KIND_TEXT[kind].cta : ""}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Add a supplier, or edit one when `supplier` is given. */
export function SupplierForm({ supplier }: { supplier?: SupplierView }) {
  const [open, setOpen] = useState(false);
  const blank = { name: "", contactName: "", phone: "", gstin: "", supplies: "", notes: "" };
  const initial = () => (supplier ? { name: supplier.name, contactName: supplier.contactName ?? "", phone: supplier.phone ?? "", gstin: supplier.gstin ?? "", supplies: supplier.supplies ?? "", notes: supplier.notes ?? "" } : blank);
  const [f, setF] = useState(initial);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const close = () => (setOpen(false), setF(initial()));
  const { error, busy, run } = useSave(close);
  const save = (body: object) => run(() => (supplier ? api("PATCH", `/v1/inventory/suppliers/${supplier.id}`, body) : api("POST", "/v1/inventory/suppliers", body)));
  return (
    <>
      {supplier ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-md px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft">
          Edit
        </button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Plus size={16} /> Add supplier
        </Button>
      )}
      <Dialog open={open} onClose={close} title={supplier ? `Edit ${supplier.name}` : "Add a raw material supplier"} description="Who Vawe buys materials from.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(f);
          }}
          className="space-y-4"
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Name" htmlFor="sup-name">
            <Input id="sup-name" value={f.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="What they supply" htmlFor="sup-supplies" optional>
            <Input id="sup-supplies" value={f.supplies} onChange={set("supplies")} placeholder="e.g. 45mm and 20mm profiles, screws" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact person" htmlFor="sup-contact" optional>
              <Input id="sup-contact" value={f.contactName} onChange={set("contactName")} />
            </Field>
            <Field label="Phone" htmlFor="sup-phone" optional>
              <Input id="sup-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} />
            </Field>
          </div>
          <Field label="GSTIN" htmlFor="sup-gstin" optional>
            <Input id="sup-gstin" value={f.gstin} onChange={set("gstin")} className="uppercase" maxLength={15} />
          </Field>
          <Field label="Notes" htmlFor="sup-notes" optional>
            <Input id="sup-notes" value={f.notes} onChange={set("notes")} />
          </Field>
          <div className={supplier ? "flex justify-between" : "flex justify-end"}>
            {supplier && (
              <Button type="button" variant="ghost" onClick={() => save({ isActive: !supplier.isActive })}>
                {supplier.isActive ? "Mark as not used" : "Mark as used again"}
              </Button>
            )}
            <Button type="submit" loading={busy} disabled={!f.name.trim()}>
              {supplier ? "Save" : "Add supplier"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function EditLine({ variant, label }: { variant: InventoryVariantView; label: string }) {
  const [open, setOpen] = useState(false);
  const [reorderLevel, setReorder] = useState(String(variant.reorderLevel));
  const [unitCost, setCost] = useState(variant.unitCost?.toString() ?? "");
  const { error, busy, run } = useSave(() => setOpen(false));
  return (
    <>
      <button type="button" title="Reorder level and cost" aria-label={`Settings: ${label}`} onClick={() => setOpen(true)} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
        <Settings2 size={15} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("PATCH", `/v1/inventory/variants/${variant.id}`, { reorderLevel, unitCost }));
          }}
          className="space-y-4"
        >
          {error && <Alert>{error}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reorder when stock is at or below" htmlFor="el-reorder">
              <Input id="el-reorder" type="number" min={0} step="any" value={reorderLevel} onChange={(e) => setReorder(e.target.value)} />
            </Field>
            <Field label="Cost per unit (₹)" htmlFor="el-cost" optional>
              <Input id="el-cost" type="number" min={0} step="any" value={unitCost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => run(() => api("PATCH", `/v1/inventory/variants/${variant.id}`, { isActive: !variant.isActive }))}
            >
              {variant.isActive ? "Stop stocking this" : "Stock this again"}
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
