// Who can see and change what. One source of truth for the API (which enforces it) and the web app
// (which only uses it to decide what to show).

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

/** Modules whose access an admin grants per staff member in ops. */
export const GRANTABLE_MODULES = ["sales", "vendor", "order", "finance"] as const;
export type GrantableModule = (typeof GRANTABLE_MODULES)[number];

/** Every module in the dashboard, in sidebar order. Inventory isn't grantable: see accessFor(). */
export const MODULES = [...GRANTABLE_MODULES, "inventory"] as const;
export type Module = (typeof MODULES)[number];

export const ACCESS_LEVELS = ["view", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export type Access = AccessLevel | "none";

export const MODULE_LABELS: Record<Module, string> = {
  sales: "Sales",
  vendor: "Vendors",
  order: "Orders",
  finance: "Finance",
  inventory: "Inventory",
};

export type Permissions = Partial<Record<GrantableModule, AccessLevel>>;

export interface AccessSubject {
  role: Role;
  permissions: Permissions;
}

/**
 * The fixed rules:
 *   admins     edit everything
 *   inventory  everyone views; only admins update stock (not grantable in ops)
 *   the rest   what an admin granted this staff member, or nothing
 */
export function accessFor(user: AccessSubject, module: Module): Access {
  if (user.role === "admin") return "edit";
  if (module === "inventory") return "view";
  return user.permissions[module] ?? "none";
}

export function canView(user: AccessSubject, module: Module): boolean {
  return accessFor(user, module) !== "none";
}

export function canEdit(user: AccessSubject, module: Module): boolean {
  return accessFor(user, module) === "edit";
}

export function accessMap(user: AccessSubject): Record<Module, Access> {
  return Object.fromEntries(MODULES.map((m) => [m, accessFor(user, m)])) as Record<Module, Access>;
}
