import { Boxes, ClipboardList, Handshake, LayoutDashboard, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { MODULE_LABELS, MODULES, type Module } from "@vawe/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The icon's colour: each module has its own, so the menu reads at a glance. */
  color: string;
  module?: Module;
}

const HREF: Record<Module, string> = {
  sales: "/sales",
  vendor: "/vendors",
  order: "/orders",
  finance: "/finance",
  inventory: "/inventory",
};

const ICON: Record<Module, LucideIcon> = {
  sales: TrendingUp,
  vendor: Handshake,
  order: ClipboardList,
  finance: Wallet,
  inventory: Boxes,
};

const COLOR: Record<Module, string> = {
  sales: "var(--chart-1)",
  vendor: "var(--chart-3)",
  order: "var(--chart-4)",
  finance: "var(--good)",
  inventory: "var(--chart-2)",
};

export const OVERVIEW: NavItem = { href: "/dashboard", label: "Overview", icon: LayoutDashboard, color: "var(--ink-2)" };

export const MODULE_NAV: NavItem[] = MODULES.map((m) => ({ href: HREF[m], label: MODULE_LABELS[m], icon: ICON[m], color: COLOR[m], module: m }));

export const moduleHref = (m: Module) => HREF[m];
