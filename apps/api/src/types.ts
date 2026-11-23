import type { BloodGroup, Permissions, Role } from "@vawe/shared";

export type Scope = "app" | "ops";

/** The signed-in person, loaded fresh from the database on every request. */
export interface AuthedUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  bloodGroup: BloodGroup | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  /** When the profile picture last changed, or null when there isn't one. */
  photoAt: Date | null;
  role: Role;
  permissions: Permissions;
  mustChangePassword: boolean;
}

export type AppEnv = {
  Variables: {
    user: AuthedUser;
    sessionHash: string;
  };
};
