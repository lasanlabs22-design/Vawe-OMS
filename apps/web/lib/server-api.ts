import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ApiError, Me } from "@vawe/shared";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

/** GET from the API on the server, passing along the visitor's cookies. */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: cookie ? { cookie } : {}, cache: "no-store" });
  } catch {
    return { ok: false, status: 502, error: { error: "The server is unreachable" } };
  }
  const body = await res.json().catch(() => ({ error: "Unexpected response" }));
  return res.ok ? { ok: true, data: body as T } : { ok: false, status: res.status, error: body as ApiError };
}

/** The signed-in dashboard user, or null. Cached for the rest of this request. */
export const getMe = cache(async () => apiGet<Me>("/auth/me"));
/** The signed-in ops admin, or null. Cached for the rest of this request. */
export const getOpsMe = cache(async () => apiGet<Me>("/ops/auth/me"));

/** For dashboard pages: the user, or off to sign-in / password change. */
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me.ok) redirect(me.status === 401 ? "/login?expired=1" : "/login");
  if (me.data.mustChangePassword) redirect("/change-password");
  return me.data;
}

/** For ops console pages: the admin, or off to the console's sign-in / password change. */
export async function requireOpsMe(): Promise<Me> {
  const me = await getOpsMe();
  if (!me.ok) redirect(me.status === 401 ? "/ops/login?expired=1" : "/ops/login");
  if (me.data.mustChangePassword) redirect("/ops/password");
  return me.data;
}
