"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type ExpenseCategory, type OrderOption, type PaymentMethod, type SupplierView } from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { todayIST } from "@/lib/dates";
import { money } from "@/lib/format";
import { Alert, Button, cx, Dialog, Field, Input, Select } from "../ui";

/** Search orders by code, vendor or customer and pick one. */
function OrderPicker({ value, onChange, required = true }: { value: OrderOption | null; onChange: (o: OrderOption | null) => void; required?: boolean }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<OrderOption[]>([]);
  useEffect(() => {
    if (value) return;
    const t = setTimeout(async () => {
      try {
        setOptions(await api<OrderOption[]>("GET", `/v1/finance/order-options?q=${encodeURIComponent(q)}`));
      } catch {
        setOptions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand bg-brand-soft/50 px-3 py-2.5 text-sm">
        <div className="min-w-0">
          <p className="font-medium tabular-nums">
            {value.code} · {value.vendorName}
          </p>
          <p className="text-[12.5px] text-ink-2">
            {value.customerName && `${value.customerName} · `}Total {money(value.total)} · Owing {money(value.outstanding)}
          </p>
        </div>
        <button type="button" className="shrink-0 text-[13px] font-medium text-brand hover:underline" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={required ? "Order code, vendor or customer" : "Optional: link to an order"} className="pl-9" autoFocus={required} />
      </div>
      {options.length > 0 && (
        <ul className="mt-1.5 max-h-56 overflow-auto rounded-lg border border-line">
          {options.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onChange(o)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium tabular-nums">{o.code}</span> · {o.vendorName}
                  {o.customerName && <span className="text-ink-3"> · {o.customerName}</span>}
                </span>
                <span className={cx("shrink-0 text-[12.5px] tabular-nums", o.outstanding > 0 ? "text-bad" : "text-good")}>{o.outstanding > 0 ? `${money(o.outstanding)} owing` : "Paid"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? { message: e.message, field: e.body.field } : { message: "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run, setError };
}

export function RecordPayment({ initialOrderId }: { initialOrderId?: string }) {
  const [open, setOpen] = useState(!!initialOrderId);
  const [order, setOrder] = useState<OrderOption | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [paidOn, setPaidOn] = useState(todayIST());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const close = () => {
    setOpen(false);
    setOrder(null);
    setAmount("");
    setReference("");
    setNote("");
    // Drop ?record= so a refresh doesn't reopen it.
    if (initialOrderId) window.history.replaceState(null, "", window.location.pathname + window.location.search.replace(/[?&]record=[^&]+/, ""));
  };
  const { error, busy, run } = useSubmit(close);

  useEffect(() => {
    if (!initialOrderId) return;
    api<OrderOption[]>("GET", `/v1/finance/order-options?id=${initialOrderId}`).then((r) => {
      if (r[0]) {
        setOrder(r[0]);
        setAmount(String(r[0].outstanding || ""));
      }
    });
  }, [initialOrderId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => api("POST", "/v1/payments", { orderId: order?.id, amount, method, paidOn, reference, note }));
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} /> Record payment
      </Button>
      <Dialog open={open} onClose={close} title="Record a payment" description="Money received against an order.">
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error.message}</Alert>}
          <Field label="Order">
            <OrderPicker
              value={order}
              onChange={(o) => {
                setOrder(o);
                if (o && !amount) setAmount(String(o.outstanding || ""));
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (₹)" htmlFor="pay-amount">
              <Input id="pay-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Paid on" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={paidOn} max={todayIST()} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="Method" htmlFor="pay-method">
              <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference" htmlFor="pay-ref" optional>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
            </Field>
          </div>
          <Field label="Note" htmlFor="pay-note" optional>
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!order || !amount}>
              Save payment
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AddExpense({ defaultCategory = "production" }: { defaultCategory?: ExpenseCategory }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [order, setOrder] = useState<OrderOption | null>(null);
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(todayIST());
  const [description, setDescription] = useState("");
  const close = () => {
    setOpen(false);
    setOrder(null);
    setAmount("");
    setDescription("");
  };
  const { error, busy, run } = useSubmit(close);
  const needsOrder = category === "porter";

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add expense
      </Button>
      <Dialog open={open} onClose={close} title="Add an expense">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("POST", "/v1/expenses", { category, orderId: order?.id ?? null, amount, spentOn, description }));
          }}
          className="space-y-4"
        >
          {error && <Alert>{error.message}</Alert>}
          <Field label="Type" htmlFor="exp-cat">
            <Select id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={needsOrder ? "Order" : "Order"} optional={!needsOrder} hint={needsOrder ? "Porter costs belong to an order" : "Link it to an order to see the order's true cost"}>
            <OrderPicker value={order} onChange={setOrder} required={needsOrder} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (₹)" htmlFor="exp-amount">
              <Input id="exp-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor="exp-date">
              <Input id="exp-date" type="date" value={spentOn} max={todayIST()} onChange={(e) => setSpentOn(e.target.value)} />
            </Field>
          </div>
          <Field label="Description" htmlFor="exp-desc" optional>
            <Input id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={category === "production" ? "e.g. Labour, power, consumables" : ""} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!amount || (needsOrder && !order)}>
              Save expense
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AddReturn() {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<OrderOption | null>(null);
  const [amount, setAmount] = useState("");
  const [returnedOn, setReturnedOn] = useState(todayIST());
  const [reason, setReason] = useState("");
  const [items, setItems] = useState("");
  const close = () => {
    setOpen(false);
    setOrder(null);
    setAmount("");
    setReason("");
    setItems("");
  };
  const { error, busy, run } = useSubmit(close);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Record return
      </Button>
      <Dialog open={open} onClose={close} title="Record a return" description="The credit lowers what the vendor owes on this order.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("POST", "/v1/returns", { orderId: order?.id, amount: amount || 0, returnedOn, reason, items }));
          }}
          className="space-y-4"
        >
          {error && <Alert>{error.message}</Alert>}
          <Field label="Order">
            <OrderPicker value={order} onChange={setOrder} />
          </Field>
          <Field label="What came back" htmlFor="ret-items" optional>
            <Input id="ret-items" value={items} onChange={(e) => setItems(e.target.value)} placeholder="e.g. Item 2, one shutter" />
          </Field>
          <Field label="Reason" htmlFor="ret-reason">
            <Input id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Glass chipped in transit" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Credit (₹)" htmlFor="ret-amount" hint="0 if it's being remade free">
              <Input id="ret-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor="ret-date">
              <Input id="ret-date" type="date" value={returnedOn} max={todayIST()} onChange={(e) => setReturnedOn(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!order || !reason.trim()}>
              Save return
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AddPurchase() {
  const [open, setOpen] = useState(false);
  const [supplierName, setSupplier] = useState("");
  const [invoiceNo, setInvoice] = useState("");
  const [purchasedOn, setDate] = useState(todayIST());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    api<SupplierView[]>("GET", "/v1/inventory/suppliers")
      .then((list) => setKnown(list.filter((s) => s.isActive).map((s) => s.name)))
      .catch(() => setKnown([]));
  }, [open]);
  const close = () => {
    setOpen(false);
    setSupplier("");
    setInvoice("");
    setAmount("");
    setDescription("");
  };
  const { error, busy, run } = useSubmit(close);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add purchase
      </Button>
      <Dialog open={open} onClose={close} title="Add a purchase" description="Materials bought. An admin adds the stock to Inventory and can link it to this purchase.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("POST", "/v1/purchases", { supplierName, invoiceNo, purchasedOn, amount, description }));
          }}
          className="space-y-4"
        >
          {error && <Alert>{error.message}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Supplier" htmlFor="pur-sup" hint={supplierName.trim() && !known.some((k) => k.toLowerCase() === supplierName.trim().toLowerCase()) ? "New: will be added to the supplier list" : undefined}>
              <Input id="pur-sup" list="pur-sup-list" value={supplierName} onChange={(e) => setSupplier(e.target.value)} autoComplete="off" autoFocus />
              <datalist id="pur-sup-list">
                {known.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="Invoice no." htmlFor="pur-inv" optional>
              <Input id="pur-inv" value={invoiceNo} onChange={(e) => setInvoice(e.target.value)} />
            </Field>
            <Field label="Amount (₹)" htmlFor="pur-amount">
              <Input id="pur-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor="pur-date">
              <Input id="pur-date" type="date" value={purchasedOn} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="What was bought" htmlFor="pur-desc" optional>
            <Input id="pur-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 40 bars 45mm frame black, 200 sq ft clear glass" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!supplierName.trim() || !amount}>
              Save purchase
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DeleteRow({ path, label }: { path: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { error, busy, run } = useSubmit(() => setOpen(false));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md px-2 py-1 text-[12px] text-ink-3 hover:bg-bad-soft hover:text-bad">
        Delete
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${label}?`} description="Only for entries made by mistake. This can't be undone.">
        {error && <Alert>{error.message}</Alert>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep
          </Button>
          <Button variant="danger" loading={busy} onClick={() => run(async () => (await api("DELETE", path), router.refresh()))}>
            Delete
          </Button>
        </div>
      </Dialog>
    </>
  );
}
