"use client";

// The switch's drawing and animation: from Uiverse.io by Type-Delta -
// https://uiverse.io/Type-Delta/smart-fox-47 (MIT License, Copyright (c) Type-Delta).

import { useEffect, useId, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/cx";
import { THEME_COOKIE } from "@/lib/theme";
import s from "./theme-toggle.module.css";

type Theme = "light" | "dark";

/**
 * The light/dark switch. Light: the ball rolls in with its trails. Dark: the ball stops in the
 * middle and a line strikes through it. The choice goes on <html data-theme> and into a cookie, so
 * the next page load renders in it from the server; the page cross-fades when it changes.
 * `onDark` is for headers that are always black (the ops console).
 */
export function ThemeToggle({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  // Unknown until mounted: the server can't see the device setting.
  const [theme, setTheme] = useState<Theme | null>(null);
  // The drawing only animates once the switch has been used (not on every page load).
  const [armed, setArmed] = useState(false);
  const id = useId();
  const mask = `theme-mask-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    const chosen = document.documentElement.dataset.theme;
    setTheme(chosen === "dark" || chosen === "light" ? chosen : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setArmed(true);
    setTheme(next);
    const apply = () => {
      document.documentElement.dataset.theme = next;
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    // Let the switch start its move, then fade the page across (where the browser supports it).
    window.setTimeout(() => {
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (doc.startViewTransition) doc.startViewTransition(apply);
      else apply();
    }, 280);
  }

  const dark = theme === "dark";
  const hint = dark ? "Dark mode" : "Light mode";

  return (
    <span className={cx("group relative inline-flex shrink-0", theme === null && "invisible", className)}>
      <label htmlFor={id} className={cx(s.root, onDark && s.onDark, armed && s.armed)} title={`${hint}. Switch to ${dark ? "light" : "dark"} mode`}>
        <input id={id} className={s.input} type="checkbox" role="switch" aria-label="Dark mode" aria-checked={dark} checked={dark} onChange={toggle} disabled={theme === null} />
        <svg strokeWidth="0" stroke="currentColor" fill="currentColor" viewBox="0 0 18 18" height="18" width="18" aria-hidden>
          <mask id={mask}>
            <rect fill="white" height="18" width="18" />
            <rect fill="black" style={{ rotate: "30deg" }} height="16" width="4.1" y="-5" x="9.807" className={s.line} />
          </mask>
          <rect style={{ rotate: "30deg" }} height="13" width="1.3" y="-3.3" x="11.3" className={s.line} />
          <g mask={`url(#${mask})`}>
            <circle style={trace("5.76px", "-.1s")} fill="none" strokeWidth=".1" r="2.95" cy="9" cx="3.24" className={s.ballTrace} />
            <circle style={trace("3px", ".02s")} fill="none" strokeWidth=".2" r="2.9" cy="9" cx="6" className={s.ballTrace} />
            <circle style={trace("0px", ".07s")} fill="none" strokeWidth=".3" r="2.8" cy="9" cx="9" className={s.ballTrace} />
            <circle style={trace("-2.75px", ".13s")} fill="none" strokeWidth=".4" r="2.75" cy="9" cx="11.75" className={s.ballTrace} />
            <circle style={{ "--_toCenterXOffset": "-5.7px" } as React.CSSProperties} r="3" cy="9" cx="14.7" className={s.ball} />
          </g>
        </svg>
      </label>
      {/* Says which mode is on, on hover or keyboard focus. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-full right-0 z-40 mt-2 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-ink opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[input:focus-visible]:opacity-100"
      >
        {dark ? <Moon size={13} /> : <Sun size={13} />}
        {hint}
      </span>
    </span>
  );
}

const trace = (offset: string, appear: string) => ({ "--_toCenterXOffset": offset, "--_appearOffset": appear }) as React.CSSProperties;
