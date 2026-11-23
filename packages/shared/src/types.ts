import type { Access, Module, Permissions, Role } from "./access";
import type { BloodGroup } from "./schemas";

export interface Profile {
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  bloodGroup: BloodGroup | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  /** Relative URL of the profile picture (through the web app's /api proxy), or null. */
  photoUrl: string | null;
}

/** The signed-in person, as the API returns it from /auth/me and /ops/auth/me. */
export interface Me extends Profile {
  id: string;
  role: Role;
  permissions: Permissions;
  access: Record<Module, Access>;
  mustChangePassword: boolean;
}

/** A row in the ops team list. */
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  photoUrl: string | null;
  role: Role;
  permissions: Permissions;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

/** Shown once, right after an admin creates someone or resets their password. */
export interface IssuedCredentials {
  name: string;
  email: string;
  temporaryPassword: string;
  signInUrl: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  actorName: string | null;
  targetName: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

/** Every error the API returns has this shape. */
export interface ApiError {
  error: string;
  code?: string;
  field?: string;
}
