"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cx } from "@/lib/cx";

export { cx };

// ---------- Buttons ----------

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-bad border border-line hover:bg-bad-soft",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }
>(function Button({ variant = "primary", size = "md", loading, disabled, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------- Form fields ----------

export function Field({ label, hint, error, htmlFor, children, optional }: { label: string; hint?: string; error?: string; htmlFor?: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label} {optional && <span className="font-normal text-ink-3">(optional)</span>}
      </label>
      {children}
      {error ? <p className="text-[13px] text-bad">{error}</p> : hint ? <p className="text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

const fieldClass =
  "block w-full rounded-lg border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 transition-colors focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-surface-2 disabled:text-ink-3";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx(fieldClass, "h-11", invalid && "border-bad", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldClass, "h-11 pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

// ---------- Display ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}

type Tone = "neutral" | "brand" | "good" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny same-origin avatar, no optimisation needed
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
    >
      {initials || "?"}
    </span>
  );
}

export function Alert({ tone = "bad", children }: { tone?: "bad" | "good" | "warn"; children: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-lg px-3 py-2.5 text-sm", TONES[tone])}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// ---------- Dialog (native <dialog>: focus trap, Esc and backdrop for free) ----------

export function Dialog({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
