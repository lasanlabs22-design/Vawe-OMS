"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { passwordProblem } from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { Alert, Button, Field, Input } from "./ui";

type Scope = "app" | "ops";
const base = (scope: Scope) => (scope === "ops" ? "/ops/auth" : "/auth");
const home = (scope: Scope) => (scope === "ops" ? "/ops" : "/dashboard");
const passwordPage = (scope: Scope) => (scope === "ops" ? "/ops/password" : "/change-password");

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return (
    <div>
      <div className="relative">
        <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={checkCaps}
          onKeyDown={checkCaps}
          autoComplete={autoComplete}
          required
          invalid={invalid}
          className="pr-11 pl-9"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-2 text-ink-3 hover:text-ink"
          aria-label={shown ? "Hide password" : "Show password"}
        >
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {caps && <p className="mt-1.5 text-[13px] text-warn">Caps Lock is on</p>}
    </div>
  );
}

export function LoginForm({ scope, notice }: { scope: Scope; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mustChangePassword: boolean }>("POST", `${base(scope)}/login`, { email, password });
      router.replace(res.mustChangePassword ? passwordPage(scope) : home(scope));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't sign in. Please try again.");
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {notice && !error && <Alert tone="warn">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9"
            placeholder="you@vaweinterio.in"
          />
        </div>
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || !password}>
        Sign in
      </Button>
      <p className="text-center text-[13px] text-ink-3">Forgot your password? Ask an admin to reset it.</p>
    </form>
  );
}

/**
 * Replaces a password. First sign-in (forced) uses the temporary password as "current"; from
 * Settings it's the person's own password.
 */
export function ChangePasswordForm({ scope, forced, onDone }: { scope: Scope; forced?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const nextProblem = next ? passwordProblem(next) : null;
  const mismatch = confirm.length > 0 && confirm !== next;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", `${base(scope)}/password`, { current, next, confirm });
      if (forced) {
        router.replace(home(scope));
        router.refresh();
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiFailure ? { message: err.message, field: err.body.field } : { message: "Couldn't change the password" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && !error.field && <Alert>{error.message}</Alert>}
      {done && <Alert tone="good">Password changed. Your other devices have been signed out.</Alert>}
      <Field label={forced ? "Temporary password" : "Current password"} htmlFor="current" error={error?.field === "current" ? error.message : undefined}>
        <PasswordInput id="current" value={current} onChange={setCurrent} autoComplete="current-password" invalid={error?.field === "current"} />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters, with a letter and a number." error={nextProblem ?? (error?.field === "next" ? error.message : undefined)}>
        <PasswordInput id="next" value={next} onChange={setNext} autoComplete="new-password" invalid={!!nextProblem} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={mismatch ? "The passwords don't match" : undefined}>
        <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} />
      </Field>
      <Button type="submit" size={forced ? "lg" : "md"} className={forced ? "w-full" : undefined} loading={busy} disabled={!current || !next || !!nextProblem || mismatch || !confirm}>
        {forced ? "Set password and continue" : "Change password"}
      </Button>
    </form>
  );
}

export function SignOutButton({ scope, className, children }: { scope: Scope; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api("POST", `${base(scope)}/logout`).catch(() => {});
        router.replace(scope === "ops" ? "/ops/login" : "/login");
        router.refresh();
      }}
    >
      {children}
    </button>
  );
}
