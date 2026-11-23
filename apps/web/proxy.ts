import { NextResponse, type NextRequest } from "next/server";

/**
 * Which address serves what, once APP_HOST and OPS_HOST are set (production):
 *   app.vaweinterio.in  sign-in and the dashboard. The ops console doesn't exist here (404).
 *   ops.vaweinterio.in  the ops console only; anything else forwards to the app address.
 * With them unset (local development) one address serves everything.
 *
 * The sign-in checks here only look at whether a cookie exists, to send people to the right page
 * quickly. The real check happens in the API on every request.
 */

const APP_COOKIES = ["__Host-vawe_session", "vawe_session"];
const OPS_COOKIES = ["__Host-vawe_ops", "vawe_ops"];
const APP_PAGES = ["/dashboard", "/sales", "/vendors", "/orders", "/finance", "/inventory", "/settings", "/change-password"];

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");
const hasAny = (request: NextRequest, names: string[]) => names.some((n) => request.cookies.has(n));

function hostOf(request: NextRequest): string {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const appHost = process.env.APP_HOST?.toLowerCase();
  const opsHost = process.env.OPS_HOST?.toLowerCase();
  const opsPath = isUnder(pathname, "/ops") || isUnder(pathname, "/api/ops");

  if (appHost && opsHost) {
    const host = hostOf(request);
    if (host === opsHost) {
      if (pathname === "/") return NextResponse.redirect(new URL("/ops", request.url), 307);
      if (!opsPath) return NextResponse.redirect(`https://${appHost}${pathname}${search}`, 308);
    } else if (host === appHost && opsPath) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (isUnder(pathname, "/ops")) {
    if (pathname === "/ops/login" || hasAny(request, OPS_COOKIES)) return NextResponse.next();
    return NextResponse.redirect(new URL("/ops/login", request.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasAny(request, APP_COOKIES) ? "/dashboard" : "/login", request.url));
  }
  if (APP_PAGES.some((p) => isUnder(pathname, p)) && !hasAny(request, APP_COOKIES)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's build assets and files with an extension (logo, favicon, ...).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
