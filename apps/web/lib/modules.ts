import { Boxes, ClipboardList, Handshake, LayoutDashboard, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { MODULE_LABELS, MODULES, type Module } from "@vawe/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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

export const OVERVIEW: NavItem = { href: "/dashboard", label: "Overview", icon: LayoutDashboard };

export const MODULE_NAV: NavItem[] = MODULES.map((m) => ({ href: HREF[m], label: MODULE_LABELS[m], icon: ICON[m], module: m }));

export const moduleHref = (m: Module) => HREF[m];
