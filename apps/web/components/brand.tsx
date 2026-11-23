/* eslint-disable @next/next/no-img-element -- small static brand PNGs, served as-is */
import { cx } from "@/lib/cx";

// Brand files come from the Vawe website (public/brand). The mark is pink on transparent; the
// wordmark has a dark version for light backgrounds and a light one for dark backgrounds.

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return <img src="/brand/vawe-mark.png" alt="" width={size} height={Math.round(size * (796 / 904))} className={cx("shrink-0", className)} />;
}

/** The VAWE wordmark. `tone` forces a version; by default it follows light/dark mode. */
export function Wordmark({ height = 16, tone }: { height?: number; tone?: "dark" | "light" }) {
  const width = Math.round(height * (2525 / 625));
  if (tone) {
    return <img src={`/brand/vawe-wordmark-${tone}.png`} alt="VAWE" width={width} height={height} />;
  }
  return (
    <>
      <img src="/brand/vawe-wordmark-dark.png" alt="VAWE" width={width} height={height} className="dark:hidden" />
      <img src="/brand/vawe-wordmark-light.png" alt="VAWE" width={width} height={height} className="hidden dark:block" />
    </>
  );
}

/** Mark + wordmark lock-up. `sub` names the area (Dashboard, Ops console). */
export function Lockup({ sub, tone }: { sub?: string; tone?: "dark" | "light" }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={30} />
      <div>
        <Wordmark height={14} tone={tone} />
        {sub && <p className="mt-1 text-[10.5px] font-medium tracking-[0.14em] text-ink-3 uppercase">{sub}</p>}
      </div>
    </div>
  );
}
