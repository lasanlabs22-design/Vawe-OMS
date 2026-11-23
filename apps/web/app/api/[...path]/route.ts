import type { NextRequest } from "next/server";

// Forwards /api/* to the Hono API. The browser only ever talks to this origin, so cookies stay
// first-party and the API itself can live on Railway's private network.

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const FORWARD_REQUEST = ["accept", "content-type", "cookie", "origin", "user-agent"];
const FORWARD_RESPONSE = ["content-type", "cache-control"];

async function forward(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Railway's edge sets X-Forwarded-For; keep only the client's address for the API's logs.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) headers.set("x-forwarded-for", ip);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The server is unreachable. Please try again in a moment." }, { status: 502 });
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
