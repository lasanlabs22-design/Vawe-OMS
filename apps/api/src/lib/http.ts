import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ApiError } from "@vawe/shared";

/** Stops the request with `{ error, code?, field? }`, the one error shape the web app understands. */
export function fail(status: ContentfulStatusCode, error: string, extra: Omit<ApiError, "error"> = {}): never {
  const body: ApiError = { error, ...extra };
  throw new HTTPException(status, { res: Response.json(body, { status }) });
}

/** Parses a JSON body against a schema; the first problem becomes a 400 naming the field. */
export async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail(400, "Send a JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(400, issue?.message ?? "Invalid input", { field: issue?.path.join(".") || undefined });
  }
  return parsed.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route's :id, which must be a UUID (anything else can't exist, so it's a 404). */
export function idParam(c: Context, name = "id"): string {
  const id = c.req.param(name);
  if (!id || !UUID.test(id)) fail(404, "Not found");
  return id;
}

/** The caller's IP as Railway's proxy reports it. For logs and rate limits only: it can be spoofed. */
export function clientIp(c: Context): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
