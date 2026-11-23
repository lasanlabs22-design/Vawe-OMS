import { z } from "zod";
import { ACCESS_LEVELS, GRANTABLE_MODULES, ROLES } from "./access";
import { passwordProblem } from "./passwords";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email"));

const password = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

// Indian mobile numbers, typed with or without +91, spaces or dashes. Stored as digits only.
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"));

export const permissionsSchema = z
  .object(Object.fromEntries(GRANTABLE_MODULES.map((m) => [m, z.enum(ACCESS_LEVELS).optional()])))
  .strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password").max(128),
    next: password,
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The new passwords don't match", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a password different from the current one", path: ["next"] });

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(120),
  email,
  phone: z.union([phone, z.literal("").transform(() => undefined)]).optional(),
  role: z.enum(ROLES),
  permissions: permissionsSchema.default({}),
});

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

// Blank optional text becomes null, so clearing a field in the form clears it in the database.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const optionalPhone = z.union([phone, z.literal("").transform(() => null), z.null()]).optional();

/** What each person edits about themselves in Settings → Profile. Email is changed by an admin. */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  department: optionalText(80),
  bloodGroup: z.union([z.enum(BLOOD_GROUPS), z.literal("").transform(() => null), z.null()]).optional(),
  phone: optionalPhone,
  emergencyName: optionalText(120),
  emergencyRelation: optionalText(40),
  emergencyPhone: optionalPhone,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(120).optional(),
  email: email.optional(),
  phone: z.union([phone, z.literal("").transform(() => null)]).optional(),
  role: z.enum(ROLES).optional(),
  permissions: permissionsSchema.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
