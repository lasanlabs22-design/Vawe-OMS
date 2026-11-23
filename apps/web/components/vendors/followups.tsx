"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, MessageSquarePlus, RotateCcw } from "lucide-react";
import type { Followup } from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { dayLabel, todayIST } from "@/lib/dates";
import { Alert, Badge, Button, cx, Dialog, Field, Input, Select } from "../ui";

type Person = { id: string; name: string };

export function AddFollowupButton({ vendorId, vendorName, people, suggestedReason, size = "md", label = "Add follow-up" }: { vendorId: string; vendorName: string; people: Person[]; suggestedReason?: string; size?: "sm" | "md"; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(suggestedReason ?? "");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState(todayIST());
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/v1/vendors/${vendorId}/followups`, { reason, notes, dueDate, assignedTo });
      setOpen(false);
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size={size} variant="secondary" onClick={() => setOpen(true)}>
        <MessageSquarePlus size={size === "sm" ? 14 : 16} /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Plan a follow-up" description={`Who should talk to ${vendorName}, about what, and by when.`}>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="What about" htmlFor="fu-reason">
            <Input id="fu-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Chase ₹45,000 overdue on VW-2611-0004" autoFocus />
          </Field>
          <Field label="Notes" htmlFor="fu-notes" optional>
            <Input id="fu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="By" htmlFor="fu-due">
              <Input id="fu-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Who" htmlFor="fu-who" optional>
              <Select id="fu-who" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Anyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!reason.trim()}>
              Save follow-up
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function FollowupList({ items, canEdit, showVendor }: { items: Followup[]; canEdit: boolean; showVendor?: boolean }) {
  const router = useRouter();
  const [closing, setClosing] = useState<Followup | null>(null);
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayIST();

  async function setStatus(f: Followup, status: "open" | "done", out?: string) {
    setBusy(true);
    try {
      await api("PATCH", `/v1/followups/${f.id}`, { status, outcome: out ?? f.outcome });
      setClosing(null);
      setOutcome("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return <p className="px-4 py-6 text-center text-sm text-ink-3 sm:px-5">No follow-ups.</p>;
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((f) => {
          const late = f.status === "open" && f.dueDate && f.dueDate < today;
          return (
            <li key={f.id} className={cx("flex items-start gap-3 px-4 py-3 sm:px-5", f.status === "done" && "opacity-60")}>
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", f.status === "done" ? "bg-good" : late ? "bg-bad" : "bg-warn")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {showVendor && (
                    <Link href={`/vendors/${f.vendorId}`} className="text-brand hover:underline">
                      {f.vendorName}
                    </Link>
                  )}
                  {showVendor && " · "}
                  {f.reason}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  {f.dueDate && <span className={cx(late && "font-medium text-bad")}>By {dayLabel(f.dueDate)} · </span>}
                  {f.assignedName ?? "Anyone"}
                  {f.notes && ` · ${f.notes}`}
                </p>
                {f.outcome && <p className="mt-1 text-[13px] text-ink-2">Outcome: {f.outcome}</p>}
              </div>
              {f.status === "done" ? (
                <div className="flex items-center gap-1">
                  <Badge tone="good">Done</Badge>
                  {canEdit && (
                    <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2" onClick={() => setStatus(f, "open")} aria-label="Reopen">
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              ) : (
                canEdit && (
                  <Button size="sm" variant="secondary" onClick={() => setClosing(f)}>
                    <Check size={14} /> Done
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
      <Dialog open={!!closing} onClose={() => setClosing(null)} title="Mark as done" description={closing?.reason}>
        <Field label="What happened?" htmlFor="fu-outcome" optional>
          <Input id="fu-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Promised payment by Friday" autoFocus />
        </Field>
        <div className="mt-5 flex justify-end">
          <Button loading={busy} onClick={() => closing && setStatus(closing, "done", outcome)}>
            Mark done
          </Button>
        </div>
      </Dialog>
    </>
  );
}
