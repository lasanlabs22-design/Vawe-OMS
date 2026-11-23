// Who can see and change what. One source of truth for the API (which enforces it) and the web app
// (which only uses it to decide what to show).

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

/** Modules whose access an admin grants per person (staff and admins alike) in ops. */
export const GRANTABLE_MODULES = ["sales", "vendor", "order", "finance"] as const;
export type GrantableModule = (typeof GRANTABLE_MODULES)[number];

/** Extra access only admins can hold: changing stock, and the catalogue & price lists. */
export const ADMIN_ONLY_PERMISSIONS = ["inventory", "settings"] as const;
export type AdminOnlyPermission = (typeof ADMIN_ONLY_PERMISSIONS)[number];

export const PERMISSION_KEYS = [...GRANTABLE_MODULES, ...ADMIN_ONLY_PERMISSIONS] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Every module in the dashboard, in sidebar order. */
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

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  ...MODULE_LABELS,
  settings: "Catalogue & prices",
};

export type Permissions = Partial<Record<PermissionKey, AccessLevel>>;

/** What a new admin gets unless set otherwise: edit everywhere. */
export const FULL_ADMIN_PERMISSIONS: Permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, "edit"])) as Permissions;

export interface AccessSubject {
  role: Role;
  permissions: Permissions;
}

/**
 * The rules:
 *   sales, vendors, orders, finance  what was granted to this person in ops (admins and staff alike)
 *   inventory   everyone views it; changing stock needs an admin with Inventory: edit
 */
export function accessFor(user: AccessSubject, module: Module): Access {
  if (module === "inventory") return user.role === "admin" && user.permissions.inventory === "edit" ? "edit" : "view";
  return user.permissions[module] ?? "none";
}

export function canView(user: AccessSubject, module: Module): boolean {
  return accessFor(user, module) !== "none";
}

export function canEdit(user: AccessSubject, module: Module): boolean {
  return accessFor(user, module) === "edit";
}

/** Catalogue & prices (order-form options, default price list, vendor rates, company details). */
export function settingsAccess(user: AccessSubject): Access {
  if (user.role !== "admin") return "none";
  return user.permissions.settings ?? "none";
}

export function accessMap(user: AccessSubject): Record<Module, Access> {
  return Object.fromEntries(MODULES.map((m) => [m, accessFor(user, m)])) as Record<Module, Access>;
}

/** Only admins hold the admin-only keys; anything else is dropped. */
export function cleanPermissions(role: Role, permissions: Permissions): Permissions {
  const allowed: readonly PermissionKey[] = role === "admin" ? PERMISSION_KEYS : GRANTABLE_MODULES;
  return Object.fromEntries(Object.entries(permissions).filter(([k, v]) => v && allowed.includes(k as PermissionKey))) as Permissions;
}
