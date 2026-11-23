import type { Scope } from "../types";

// The browser crops and compresses pictures to a 320 px JPEG before upload, so a real one is small.
// The cap leaves room for a busy photo while keeping rows light.
export const MAX_PHOTO_BYTES = 150 * 1024;
const PREFIX = "data:image/jpeg;base64,";

/** Validates an uploaded data URL and returns its base64 body, or null if it isn't a sane JPEG. */
export function parseJpegDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  const base64 = value.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;
  // JPEG files start with FF D8 FF; anything else is not what the browser's encoder produced.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return base64;
}

/** Where the web app loads a picture from. The version busts the cache when the picture changes. */
export function photoUrl(scope: Scope, userId: string, at: Date | null): string | null {
  if (!at) return null;
  const base = scope === "ops" ? "/api/ops/auth" : "/api/auth";
  return `${base}/photos/${userId}?v=${at.getTime()}`;
}
