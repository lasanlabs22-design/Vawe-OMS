import { Lockup, LogoMark, Wordmark } from "./brand";

/** Split screen: the brand on an onyx panel (as in the logo), the form on porcelain. */
export function AuthFrame({ area, title, subtitle, children }: { area: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      {/* The logo as a faint watermark in the exact middle of the screen, over both halves and
          behind the text and form. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <div className="-translate-x-12 opacity-[0.07]">
          <div className="animate-fade">
            <LogoMark size={460} />
          </div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-onyx text-[#f5f1ec] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="animate-rise flex items-center gap-3">
          <LogoMark size={40} />
          <Wordmark height={18} tone="light" />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="animate-rise text-[12px] font-medium tracking-[0.24em] text-white/50 uppercase [animation-delay:80ms]">{area}</p>
          <p className="animate-rise mt-5 font-display text-5xl leading-[1.08] tracking-tight [animation-delay:160ms]">
            Orders, production and payments, <span className="text-[#fa0365]">in one place.</span>
          </p>
          <p className="animate-rise mt-5 text-white/60 [animation-delay:240ms]">For the Vawe Interio team only. Access is given by an admin.</p>
        </div>
        <p className="relative z-10 text-xs text-white/40">© {new Date().getFullYear()} Vawe Interio</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="animate-rise relative z-10 w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Lockup sub={area} />
          </div>
          <h1 className="font-display text-[34px] leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
