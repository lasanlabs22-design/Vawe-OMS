import type { ApiError } from "@vawe/shared";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.error);
  }
}

/** Calls the API from the browser (through this site's /api proxy). Throws ApiFailure on errors. */
export async function api<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure(0, { error: "No connection. Check your internet and try again." });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFailure(res.status, { error: "Something went wrong", ...(data as Partial<ApiError>) } as ApiError);
  return data as T;
}
