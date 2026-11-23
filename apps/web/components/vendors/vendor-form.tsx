"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Search } from "lucide-react";
import {
  checkGstin,
  PAYMENT_TERM_LABELS,
  PAYMENT_TERMS,
  RATE_FIELDS,
  type GstLookup,
  type PaymentTerms,
  type PricingModel,
  type Rates,
  type VendorDetail,
} from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { Alert, Button, Card, cx, Field, Input, Select } from "../ui";

type Draft = {
  firmName: string;
  gstin: string;
  legalName: string;
  tradeName: string;
  address: string;
  state: string;
  gstStatus: string;
  branches: string;
  pricingModel: PricingModel;
  paymentTerms: PaymentTerms;
  paymentDays: string;
  paymentNote: string;
  deliveryTerms: string;
  discountPercent: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
  remarks: string;
  rates: Record<keyof Rates, string>;
};

const fromVendor = (v?: VendorDetail): Draft => ({
  firmName: v?.firmName ?? "",
  gstin: v?.gstin ?? "",
  legalName: v?.legalName ?? "",
  tradeName: v?.tradeName ?? "",
  address: v?.address ?? "",
  state: v?.state ?? "",
  gstStatus: v?.gstStatus ?? "",
  branches: String(v?.branches ?? 1),
  pricingModel: v?.pricingModel ?? "rft",
  paymentTerms: v?.paymentTerms ?? "before_delivery",
  paymentDays: v?.paymentDays?.toString() ?? "",
  paymentNote: v?.paymentNote ?? "",
  deliveryTerms: v?.deliveryTerms ?? "",
  discountPercent: String(v?.discountPercent ?? 0),
  contact1Name: v?.contact1Name ?? "",
  contact1Phone: v?.contact1Phone ?? "",
  contact1Email: v?.contact1Email ?? "",
  contact2Name: v?.contact2Name ?? "",
  contact2Phone: v?.contact2Phone ?? "",
  contact2Email: v?.contact2Email ?? "",
  remarks: v?.remarks ?? "",
  rates: Object.fromEntries(RATE_FIELDS.map((f) => [f.key, v?.rates[f.key]?.toString() ?? ""])) as Record<keyof Rates, string>,
});

export function VendorForm({ vendor, isAdmin, defaultRates }: { vendor?: VendorDetail; isAdmin: boolean; defaultRates: Rates }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => fromVendor(vendor));
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gst, setGst] = useState<GstLookup | null>(null);
  const [checking, setChecking] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const field = (k: keyof Draft) => ({
    value: d[k] as string,
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
    invalid: error?.field === k,
  });
  const err = (k: string) => (error?.field === k ? error.message : undefined);
  const gstOffline = d.gstin.trim().length === 15 ? checkGstin(d.gstin) : null;

  async function lookup() {
    setChecking(true);
    try {
      const res = await api<GstLookup>("POST", "/v1/gst/lookup", { gstin: d.gstin });
      setGst(res);
      if (res.valid) {
        setD((x) => ({
          ...x,
          gstin: res.gstin ?? x.gstin,
          state: res.state ?? x.state,
          legalName: res.details?.legalName ?? x.legalName,
          tradeName: res.details?.tradeName ?? x.tradeName,
          address: res.details?.address ?? x.address,
          gstStatus: res.details?.status ?? x.gstStatus,
          firmName: x.firmName || res.details?.tradeName || res.details?.legalName || "",
        }));
      }
    } catch (e) {
      setGst({ valid: false, reason: e instanceof ApiFailure ? e.message : "Lookup failed", source: "offline" });
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { ...d, rates: undefined };
    if (isAdmin) body.rates = Object.fromEntries(Object.entries(d.rates).filter(([, v]) => v !== ""));
    else delete body.discountPercent;
    try {
      const saved = vendor ? await api<{ id: string }>("PATCH", `/v1/vendors/${vendor.id}`, body) : await api<{ id: string }>("POST", "/v1/vendors", body);
      router.push(`/vendors/${saved.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? { message: e.message, field: e.body.field } : { message: "Couldn't save" });
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && <Alert>{error.message}</Alert>}

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Business</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="GSTIN" htmlFor="gstin" optional hint={gstOffline && !gstOffline.valid ? undefined : "We check it and fill in the details"} error={gstOffline && !gstOffline.valid ? gstOffline.reason : err("gstin")}>
            <div className="flex gap-2">
              <Input id="gstin" {...field("gstin")} onChange={(e) => (set("gstin", e.target.value.toUpperCase()), setGst(null))} maxLength={15} placeholder="29ABCDE1234F1Z5" className="font-mono uppercase" />
              <Button type="button" variant="secondary" onClick={lookup} loading={checking} disabled={d.gstin.trim().length !== 15}>
                <Search size={16} /> Fetch
              </Button>
            </div>
          </Field>
          <Field label="Firm name" htmlFor="firmName" error={err("firmName")}>
            <Input id="firmName" {...field("firmName")} autoFocus={!vendor} />
          </Field>
        </div>
        {gst && (
          <div className="mt-4">
            {gst.valid ? (
              <Alert tone={gst.source === "api" ? "good" : "warn"}>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <BadgeCheck size={15} /> GSTIN is valid · {gst.state ?? "Unknown state"} · PAN {gst.pan}
                </span>
                {gst.message && <span className="mt-1 block">{gst.message}</span>}
              </Alert>
            ) : (
              <Alert>{gst.reason ?? gst.message}</Alert>
            )}
          </div>
        )}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Legal name" htmlFor="legalName" optional>
            <Input id="legalName" {...field("legalName")} />
          </Field>
          <Field label="Trade name" htmlFor="tradeName" optional>
            <Input id="tradeName" {...field("tradeName")} />
          </Field>
          <Field label="Address" htmlFor="address" optional>
            <Input id="address" {...field("address")} />
          </Field>
          <div className="grid grid-cols-2 gap-5">
            <Field label="State" htmlFor="state" optional>
              <Input id="state" {...field("state")} />
            </Field>
            <Field label="Branches" htmlFor="branches" error={err("branches")}>
              <Input id="branches" type="number" min={1} inputMode="numeric" {...field("branches")} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Contacts</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <Field label="Person of contact" htmlFor="contact1Name" optional>
            <Input id="contact1Name" {...field("contact1Name")} />
          </Field>
          <Field label="Number" htmlFor="contact1Phone" optional error={err("contact1Phone")}>
            <Input id="contact1Phone" type="tel" inputMode="tel" {...field("contact1Phone")} />
          </Field>
          <Field label="Email" htmlFor="contact1Email" optional error={err("contact1Email")}>
            <Input id="contact1Email" type="email" {...field("contact1Email")} />
          </Field>
          <Field label="Second person of contact" htmlFor="contact2Name" optional>
            <Input id="contact2Name" {...field("contact2Name")} />
          </Field>
          <Field label="Number" htmlFor="contact2Phone" optional error={err("contact2Phone")}>
            <Input id="contact2Phone" type="tel" inputMode="tel" {...field("contact2Phone")} />
          </Field>
          <Field label="Email" htmlFor="contact2Email" optional error={err("contact2Email")}>
            <Input id="contact2Email" type="email" {...field("contact2Email")} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Payment and delivery</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <Field label="Payment terms" htmlFor="paymentTerms" hint="Sets when payment is due after delivery">
            <Select id="paymentTerms" value={d.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value as PaymentTerms)}>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>
                  {PAYMENT_TERM_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          {d.paymentTerms === "custom" && (
            <Field label="Days after delivery" htmlFor="paymentDays" error={err("paymentDays")}>
              <Input id="paymentDays" type="number" min={0} inputMode="numeric" {...field("paymentDays")} />
            </Field>
          )}
          <Field label="Payment note" htmlFor="paymentNote" optional hint='e.g. "Email on the 1st/2nd of every month"'>
            <Input id="paymentNote" {...field("paymentNote")} />
          </Field>
          <Field label="Delivery" htmlFor="deliveryTerms" optional hint='e.g. "Free delivery"'>
            <Input id="deliveryTerms" {...field("deliveryTerms")} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Product-level pricing</h2>
            <p className="mt-1 text-sm text-ink-2">Leave a rate empty to use the default price list{isAdmin ? "" : ". Only admins can change prices"}.</p>
          </div>
          <div role="radiogroup" aria-label="Pricing model" className="inline-flex rounded-lg bg-surface-2 p-0.5">
            {(["rft", "sqft"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={d.pricingModel === m}
                disabled={!isAdmin && !!vendor}
                onClick={() => set("pricingModel", m)}
                className={cx("h-8 rounded-md px-3 text-[13px] font-medium disabled:cursor-not-allowed", d.pricingModel === m ? "bg-solid text-on-solid shadow-sm" : "text-ink-2")}
              >
                {m === "rft" ? "RFT pricing" : "SQFT pricing"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {RATE_FIELDS.filter((f) => (d.pricingModel === "rft" ? f.group !== "SQFT" : f.group !== "RFT" && f.key !== "makingCharge")).map((f) => (
            <Field key={f.key} label={`${f.group === "Other" ? "" : `${f.group}: `}${f.label}`} htmlFor={`rate-${f.key}`} hint={`${f.unit}${defaultRates[f.key] !== undefined ? ` · default ${defaultRates[f.key]}` : ""}`}>
              <Input
                id={`rate-${f.key}`}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                disabled={!isAdmin}
                value={d.rates[f.key]}
                placeholder={defaultRates[f.key]?.toString() ?? "—"}
                onChange={(e) => setD((x) => ({ ...x, rates: { ...x.rates, [f.key]: e.target.value } }))}
              />
            </Field>
          ))}
          {isAdmin && (
            <Field label="Discount" htmlFor="discountPercent" hint="% off every estimate (the workbook's 5% flag)" error={err("discountPercent")}>
              <Input id="discountPercent" type="number" min={0} max={100} step="0.5" inputMode="decimal" {...field("discountPercent")} />
            </Field>
          )}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <Field label="Remarks" htmlFor="remarks" optional hint='e.g. "Glass to be calculated in 6-inch steps"'>
          <textarea id="remarks" rows={3} value={d.remarks} onChange={(e) => set("remarks", e.target.value)} className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none" />
        </Field>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {vendor ? "Save vendor" : "Add vendor"}
        </Button>
      </div>
    </form>
  );
}
