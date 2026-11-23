// A small in-memory limiter for sign-in attempts per IP, on top of the per-account lockout. It resets
// when the API restarts, which is fine for one API instance; move it to the database if we ever run
// several.

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

/** Records an attempt and returns the seconds to wait if this IP is over the limit, else null. */
export function takeAttempt(key: string | null): number | null {
  if (!key) return null;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS ? Math.ceil((entry.resetAt - now) / 1000) : null;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
}, WINDOW_MS).unref();
