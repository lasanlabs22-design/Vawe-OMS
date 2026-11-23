"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  CATALOG_KIND_LABELS,
  GLASS_GROUP_LABELS,
  GLASS_GROUPS,
  RATE_FIELDS,
  type Catalog,
  type CatalogItem,
  type CatalogKind,
  type Company,
  type GlassGroup,
  type OrderFamily,
  type Rates,
} from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { Alert, Badge, Button, Card, cx, Field, Input, Select } from "../ui";

export function DefaultRatesForm({ rates }: { rates: Rates }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(RATE_FIELDS.map((f) => [f.key, rates[f.key]?.toString() ?? ""])));
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("PUT", "/v1/settings/rates", Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")));
      setMsg({ tone: "good", text: "Saved. New estimates use these rates; existing orders keep theirs until repriced." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof ApiFailure ? err.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold">Default price list</h2>
      <p className="mt-1 text-sm text-ink-2">Used for walk-in customers and for any rate a vendor doesn't have.</p>
      <form onSubmit={submit} className="mt-5">
        {msg && (
          <div className="mb-4">
            <Alert tone={msg.tone}>{msg.text}</Alert>
          </div>
        )}
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {RATE_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.group === "Other" ? "" : `${f.group}: `}${f.label}`} htmlFor={`dr-${f.key}`} hint={f.unit}>
              <Input id={`dr-${f.key}`} type="number" min={0} step="0.01" inputMode="decimal" value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="submit" loading={busy}>
            Save price list
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function CompanyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [v, setV] = useState({ name: company.name, gstin: company.gstin ?? "", address: company.address ?? "", phone: company.phone ?? "", email: company.email ?? "" });
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("PUT", "/v1/settings/company", v);
      setMsg({ tone: "good", text: "Saved." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof ApiFailure ? err.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold">Company details</h2>
      <p className="mt-1 text-sm text-ink-2">Printed on the DWG and job card.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          {(["name", "gstin", "phone", "email"] as const).map((k) => (
            <Field key={k} label={{ name: "Company name", gstin: "GSTIN", phone: "Phone", email: "Email" }[k]} htmlFor={`co-${k}`} optional={k !== "name"}>
              <Input id={`co-${k}`} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Field label="Address" htmlFor="co-address" optional>
          <Input id="co-address" value={v.address} onChange={(e) => setV((x) => ({ ...x, address: e.target.value }))} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

const LISTS: { kind: CatalogKind; key: keyof Catalog }[] = [
  { kind: "order_type", key: "orderTypes" },
  { kind: "frame_type", key: "frameTypes" },
  { kind: "frame_colour", key: "frameColours" },
  { kind: "glass_type", key: "glassTypes" },
  { kind: "handle_position", key: "handlePositions" },
  { kind: "divider", key: "dividers" },
];

export function CatalogEditor({ catalog }: { catalog: Catalog }) {
  const [kind, setKind] = useState<CatalogKind>("order_type");
  const list = LISTS.find((l) => l.kind === kind)!;
  const items = catalog[list.key] as (CatalogItem & { family?: OrderFamily; glassGroup?: GlassGroup; handleTypes?: CatalogItem[] })[];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-5 sm:p-6">
        <h2 className="font-semibold">Order form options</h2>
        <p className="mt-1 text-sm text-ink-2">The dropdowns on the order form (the workbook's Mapping sheet). Switching an option off hides it from new orders; old orders keep it.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {LISTS.map((l) => (
            <button
              key={l.kind}
              type="button"
              onClick={() => setKind(l.kind)}
              className={cx("rounded-full border px-3 py-1 text-[13px]", kind === l.kind ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}
            >
              {CATALOG_KIND_LABELS[l.kind]}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.id} className="px-5 py-3 sm:px-6">
            <OptionRow item={it} kind={kind} />
            {kind === "order_type" && it.handleTypes && (
              <div className="mt-2 ml-4 border-l-2 border-line pl-4">
                <p className="mb-1 text-[12px] text-ink-3">Handle types for {it.name}</p>
                <ul className="space-y-1">
                  {it.handleTypes.map((h) => (
                    <li key={h.id}>
                      <OptionRow item={h} kind="handle_type" compact />
                    </li>
                  ))}
                </ul>
                <AddOption kind="handle_type" orderTypeId={it.id} compact />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-line p-5 sm:p-6">
        <AddOption kind={kind} />
      </div>
    </Card>
  );
}

function OptionRow({ item, kind, compact }: { item: CatalogItem & { family?: OrderFamily; glassGroup?: GlassGroup }; kind: CatalogKind; compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", `/v1/catalog/${item.id}`, body);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cx("flex flex-wrap items-center gap-2", !item.isActive && "opacity-60")}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== item.name && patch({ name: name.trim() })}
        aria-label="Option name"
        className={cx("min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-line focus:border-brand focus:outline-none", compact ? "text-[13px]" : "text-sm font-medium")}
      />
      {kind === "order_type" && item.family && <Badge tone="neutral">{item.family === "sliding" ? "Sliding pricing" : "Profile shutter pricing"}</Badge>}
      {kind === "glass_type" && item.glassGroup && (
        <select value={item.glassGroup} onChange={(e) => patch({ glassGroup: e.target.value })} className="rounded-md border border-line bg-surface px-2 py-1 text-[12.5px]" aria-label="Priced as">
          {GLASS_GROUPS.map((g) => (
            <option key={g} value={g}>
              {GLASS_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      )}
      <button type="button" disabled={busy} onClick={() => patch({ isActive: !item.isActive })} className={cx("rounded-md px-2 py-1 text-[12.5px] font-medium", item.isActive ? "text-ink-3 hover:bg-surface-2" : "text-brand hover:bg-brand-soft")}>
        {item.isActive ? "Switch off" : "Switch on"}
      </button>
      {error && <p className="w-full text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

function AddOption({ kind, orderTypeId, compact }: { kind: CatalogKind; orderTypeId?: string; compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [family, setFamily] = useState<OrderFamily>("sliding");
  const [glassGroup, setGlassGroup] = useState<GlassGroup>("regular");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/v1/catalog", { kind, name, orderTypeId, family: kind === "order_type" ? family : undefined, glassGroup: kind === "glass_type" ? glassGroup : undefined });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't add");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={cx("flex flex-wrap items-end gap-2", compact && "mt-1.5")}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={compact ? "New handle type" : `New ${CATALOG_KIND_LABELS[kind].toLowerCase().replace(/s$/, "")}`} className={cx("max-w-xs", compact && "h-9 text-[13px]")} aria-label="New option" />
      {kind === "order_type" && (
        <Select value={family} onChange={(e) => setFamily(e.target.value as OrderFamily)} className="h-11 max-w-[200px]" aria-label="Priced as">
          <option value="sliding">Sliding pricing</option>
          <option value="profile_shutter">Profile shutter pricing</option>
        </Select>
      )}
      {kind === "glass_type" && (
        <Select value={glassGroup} onChange={(e) => setGlassGroup(e.target.value as GlassGroup)} className="h-11 max-w-[220px]" aria-label="Priced as">
          {GLASS_GROUPS.map((g) => (
            <option key={g} value={g}>
              {GLASS_GROUP_LABELS[g]}
            </option>
          ))}
        </Select>
      )}
      <Button type="submit" size={compact ? "sm" : "md"} variant="secondary" loading={busy} disabled={!name.trim()}>
        <Plus size={15} /> Add
      </Button>
      {error && <p className="w-full text-[12.5px] text-bad">{error}</p>}
    </form>
  );
}
