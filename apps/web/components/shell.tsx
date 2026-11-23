"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import type { Me } from "@vawe/shared";
import { MODULE_NAV, OVERVIEW, type NavItem } from "@/lib/modules";
import { SignOutButton } from "./auth-forms";
import { LogoMark, Wordmark } from "./brand";
import { Avatar, cx } from "./ui";

const STORAGE_KEY = "vawe.sidebar.collapsed";

/**
 * The dashboard frame. On wide screens the sidebar collapses to an icon rail and back with one tap
 * (remembered on this device). On phones it slides in over the page from the menu button.
 */
export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage blocked: start expanded */
    }
  }, []);

  // Close the phone drawer after navigating.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Esc closes the phone drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* not remembered, still works */
      }
      return !c;
    });
  }

  const items = [OVERVIEW, ...MODULE_NAV.filter((n) => !n.module || me.access[n.module] !== "none")];
  const current = [...items, { href: "/settings", label: "Settings", icon: Settings }].find(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Phone drawer backdrop */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cx("fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")}
      />

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
        )}
        aria-label="Main navigation"
      >
        <div className={cx("flex h-16 shrink-0 items-center border-b border-line", collapsed ? "lg:justify-center lg:px-0" : "", "justify-between px-4")}>
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Vawe dashboard home">
            <LogoMark size={30} />
            <span className={cx("transition-opacity", collapsed && "lg:hidden")}>
              <Wordmark height={13} />
            </span>
          </Link>
          <button type="button" className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item, i) => (
            <NavLink
              key={item.href}
              item={item}
              active={current?.href === item.href}
              collapsed={collapsed}
              viewOnly={!!item.module && me.access[item.module] === "view"}
              delay={i * 35}
            />
          ))}
        </nav>

        <div className="space-y-1 border-t border-line p-3">
          <NavLink item={{ href: "/settings", label: "Settings", icon: Settings }} active={current?.href === "/settings"} collapsed={collapsed} />
          <div className={cx("mt-2 flex items-center gap-3 rounded-xl p-2", collapsed && "lg:justify-center lg:p-1")}>
            <Avatar name={me.name} src={me.photoUrl} size={34} />
            <div className={cx("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <p className="truncate text-sm font-medium">{me.name}</p>
              <p className="truncate text-xs text-ink-3">{me.role === "admin" ? "Admin" : (me.department ?? "Staff")}</p>
            </div>
            <SignOutButton scope="app" className={cx("rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-bad", collapsed && "lg:hidden")}>
              <LogOut size={17} aria-label="Sign out" />
            </SignOutButton>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <button type="button" className="-ml-1 rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
            <Menu size={20} />
          </button>
          <button
            type="button"
            className="-ml-2 hidden rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:inline-flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <p className="truncate text-[15px] font-medium">{current?.label ?? "Dashboard"}</p>
          <div className="ml-auto lg:hidden">
            <Avatar name={me.name} src={me.photoUrl} size={30} />
          </div>
        </header>
        <main key={pathname} className="animate-rise mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, active, collapsed, viewOnly, delay = 0 }: { item: NavItem; active: boolean; collapsed: boolean; viewOnly?: boolean; delay?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={cx(
        "group animate-rise relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors",
        active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        collapsed && "lg:justify-center lg:px-0",
      )}
    >
      {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-brand" />}
      <Icon size={19} className="shrink-0" />
      <span className={cx("flex-1 truncate", collapsed && "lg:hidden")}>{item.label}</span>
      {viewOnly && <span className={cx("rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3", collapsed && "lg:hidden")}>View</span>}
    </Link>
  );
}
