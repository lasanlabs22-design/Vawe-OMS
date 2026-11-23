"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Pause, Pencil, Play, Plus } from "lucide-react";
import {
  FULL_ADMIN_PERMISSIONS,
  GRANTABLE_MODULES,
  MODULE_LABELS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type AccessLevel,
  type IssuedCredentials,
  type PermissionKey,
  type Me,
  type Permissions,
  type Role,
  type TeamMember,
} from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { phone as fmtPhone, relativeTime } from "@/lib/format";
import { Alert, Avatar, Badge, Button, Card, cx, Dialog, Field, Input } from "../ui";

// ---------- Permission grid ----------

const LEVELS: { value: AccessLevel | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

/**
 * What this person can do in the dashboard. Admins and staff both get the module rows; admins also
 * get Inventory (view or edit stock) and Catalogue & prices.
 */
function PermissionGrid({ role, value, onChange }: { role: Role; value: Permissions; onChange: (p: Permissions) => void }) {
  const set = (m: PermissionKey, level: AccessLevel | "none") => {
    const next = { ...value };
    if (level === "none") delete next[m];
    else next[m] = level;
    onChange(next);
  };
  const row = (m: PermissionKey, levels: typeof LEVELS, hint?: string) => {
    const current = value[m] ?? levels[0]!.value;
    return (
      <div key={m} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">{PERMISSION_LABELS[m]}</p>
          {hint && <p className="text-[12px] text-ink-3">{hint}</p>}
        </div>
        <div role="radiogroup" aria-label={`${PERMISSION_LABELS[m]} access`} className="inline-flex shrink-0 rounded-lg bg-surface-2 p-0.5">
          {levels.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={current === l.value}
              onClick={() => set(m, l.value)}
              className={cx(
                "h-8 min-w-14 rounded-md px-2.5 text-[13px] font-medium transition-all",
                current === l.value ? (l.value === "none" ? "bg-surface text-ink shadow-sm" : "bg-solid text-on-solid shadow-sm") : "text-ink-3 hover:text-ink",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {GRANTABLE_MODULES.map((m) => row(m, LEVELS))}
      {role === "admin" ? (
        <>
          {row("inventory", LEVELS.slice(1), "Edit: add items and change stock")}
          {row("settings", LEVELS, "Order-form options, price lists, vendor rates")}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="text-sm font-medium">{MODULE_LABELS.inventory}</span>
          <span className="text-[13px] text-ink-3">View only · staff can't change stock</span>
        </div>
      )}
    </div>
  );
}

function RoleToggle({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["staff", "admin"] as const).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cx(
            "rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === r ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2",
          )}
        >
          <p className="text-sm font-semibold">{r === "admin" ? "Admin" : "Staff"}</p>
          <p className="mt-0.5 text-xs text-ink-2">{r === "admin" ? "This console, plus the access below" : "Only the access below"}</p>
        </button>
      ))}
    </div>
  );
}

// ---------- Credentials shown once ----------

function CredentialsDialog({ credentials, onClose, title }: { credentials: IssuedCredentials | null; onClose: () => void; title: string }) {
  const [copied, setCopied] = useState(false);
  if (!credentials) return <Dialog open={false} onClose={onClose} title={title}>{null}</Dialog>;
  const text = `Vawe OMS sign-in\n${credentials.signInUrl}\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}\nYou'll choose your own password when you first sign in.`;
  return (
    <Dialog open onClose={onClose} title={title} description={`Send these to ${credentials.name}. The password is shown only once.`}>
      <dl className="space-y-3 rounded-xl border border-line bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Sign in at</dt>
          <dd className="font-medium break-all">{credentials.signInUrl}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Email</dt>
          <dd className="font-medium">{credentials.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Temporary password</dt>
          <dd className="font-mono text-lg font-semibold tracking-wide">{credentials.temporaryPassword}</dd>
        </div>
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy all"}
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}

// ---------- Add / edit ----------

type Draft = { name: string; email: string; phone: string; role: Role; permissions: Permissions };

function PersonForm({ initial, self, submitLabel, onSubmit }: { initial: Draft; self?: boolean; submitLabel: string; onSubmit: (d: Draft) => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldError = (f: string) => (error?.field === f ? error.message : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiFailure ? { message: err.message, field: err.body.field } : { message: "Couldn't save" });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && !error.field?.match(/^(name|email|phone)$/) && <Alert>{error.message}</Alert>}
      <Field label="Full name" htmlFor="p-name" error={fieldError("name")}>
        <Input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" htmlFor="p-email" error={fieldError("email")}>
          <Input id="p-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </Field>
        <Field label="Phone" htmlFor="p-phone" optional error={fieldError("phone")}>
          <Input id="p-phone" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        </Field>
      </div>
      <Field label="Role">
        <RoleToggle
          value={draft.role}
          // Making someone an admin starts them at full edit (adjust below); back to staff keeps module access.
          onChange={(role) => setDraft({ ...draft, role, permissions: role === "admin" && draft.role !== "admin" ? { ...FULL_ADMIN_PERMISSIONS } : draft.permissions })}
          disabled={self}
        />
      </Field>
      <Field label="Access">
        <PermissionGrid role={draft.role} value={draft.permissions} onChange={(permissions) => setDraft({ ...draft, permissions })} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={busy} disabled={!draft.name.trim() || !draft.email.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AddPersonButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState<IssuedCredentials | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={17} /> Add person
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a person" description="They get a temporary password and choose their own at first sign-in." wide>
        <PersonForm
          initial={{ name: "", email: "", phone: "", role: "staff", permissions: {} }}
          submitLabel="Create account"
          onSubmit={async (d) => {
            const creds = await api<IssuedCredentials>("POST", "/ops/users", d);
            setOpen(false);
            setCredentials(creds);
            router.refresh();
          }}
        />
      </Dialog>
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} title="Account created" />
    </>
  );
}

// ---------- The list ----------

export function TeamList({ team, me }: { team: TeamMember[]; me: Me }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [confirming, setConfirming] = useState<{ member: TeamMember; kind: "reset" | "deactivate" | "reactivate" } | null>(null);
  const [credentials, setCredentials] = useState<IssuedCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmAction() {
    if (!confirming) return;
    const { member, kind } = confirming;
    setBusy(true);
    setError(null);
    try {
      if (kind === "reset") {
        setCredentials(await api<IssuedCredentials>("POST", `/ops/users/${member.id}/reset-password`));
      } else {
        await api("POST", `/ops/users/${member.id}/status`, { active: kind === "reactivate" });
      }
      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  const accessSummary = (m: TeamMember) => {
    const keys = m.role === "admin" ? PERMISSION_KEYS : GRANTABLE_MODULES;
    if (m.role === "admin" && keys.every((k) => m.permissions[k] === "edit")) return <Badge tone="brand">Full access</Badge>;
    const granted = keys.filter((g) => m.permissions[g]);
    if (!granted.length) return <span className="text-[13px] text-ink-3">Inventory (view) only</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {granted.map((g) => (
          <Badge key={g} tone={m.permissions[g] === "edit" ? "good" : "neutral"}>
            {PERMISSION_LABELS[g]} · {m.permissions[g] === "edit" ? "Edit" : "View"}
          </Badge>
        ))}
      </div>
    );
  };

  const confirmText = confirming && {
    reset: { title: "Reset password?", body: `${confirming.member.name} gets a new temporary password and is signed out everywhere.`, cta: "Reset password" },
    deactivate: { title: "Deactivate account?", body: `${confirming.member.name} is signed out at once and can't sign in until reactivated. Their records stay.`, cta: "Deactivate" },
    reactivate: { title: "Reactivate account?", body: `${confirming.member.name} will be able to sign in again with their existing password.`, cta: "Reactivate" },
  }[confirming.kind];

  return (
    <>
      <div className="grid gap-3">
        {team.map((m, i) => {
          const self = m.id === me.id;
          return (
            <Card key={m.id} className={cx("animate-rise min-w-0 p-4 sm:p-5", !m.isActive && "opacity-70")}>
              <div style={{ animationDelay: `${i * 40}ms` }} className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.name} src={m.photoUrl} size={44} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="truncate">{m.name}</span>
                      {self && <span className="text-xs font-normal text-ink-3">(you)</span>}
                      <Badge tone={m.role === "admin" ? "brand" : "neutral"}>{m.role === "admin" ? "Admin" : "Staff"}</Badge>
                      {!m.isActive && <Badge tone="bad">Deactivated</Badge>}
                      {m.mustChangePassword && m.isActive && <Badge tone="warn">Temporary password</Badge>}
                      {m.lockedUntil && <Badge tone="bad">Locked out</Badge>}
                    </p>
                    <p className="truncate text-[13px] text-ink-2">
                      {m.email}
                      {m.phone && ` · ${fmtPhone(m.phone)}`}
                      {m.department && ` · ${m.department}`}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 lg:w-80">{accessSummary(m)}</div>
                <div className="flex items-center justify-between gap-3 lg:w-auto lg:justify-end">
                  <p className="text-[13px] text-ink-3 lg:hidden xl:block xl:w-28">{m.lastLoginAt ? relativeTime(m.lastLoginAt) : "Never signed in"}</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
                      <Pencil size={14} /> <span className="hidden sm:inline">Edit</span>
                    </Button>
                    {!self && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setConfirming({ member: m, kind: "reset" })} aria-label={`Reset password for ${m.name}`}>
                          <KeyRound size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant={m.isActive ? "danger" : "secondary"}
                          onClick={() => setConfirming({ member: m, kind: m.isActive ? "deactivate" : "reactivate" })}
                          aria-label={m.isActive ? `Deactivate ${m.name}` : `Reactivate ${m.name}`}
                        >
                          {m.isActive ? <Pause size={14} /> : <Play size={14} />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}` : ""} wide>
        {editing && (
          <PersonForm
            key={editing.id}
            self={editing.id === me.id}
            initial={{ name: editing.name, email: editing.email, phone: editing.phone ?? "", role: editing.role, permissions: editing.permissions }}
            submitLabel="Save changes"
            onSubmit={async (d) => {
              await api("PATCH", `/ops/users/${editing.id}`, d);
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!confirming} onClose={() => (setConfirming(null), setError(null))} title={confirmText?.title ?? ""}>
        <p className="text-sm text-ink-2">{confirmText?.body}</p>
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button variant={confirming?.kind === "deactivate" ? "danger" : "primary"} loading={busy} onClick={confirmAction}>
            {confirmText?.cta}
          </Button>
        </div>
      </Dialog>

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} title="New temporary password" />
    </>
  );
}
