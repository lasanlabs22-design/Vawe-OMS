const TZ = "Asia/Kolkata";

export function shortDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(new Date(iso));
}

export function dateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return shortDate(iso);
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 (Indian grouping). */
export const money = (n: number | null | undefined) => inr.format(n ?? 0);
export const moneyExact = (n: number | null | undefined) => inrPaise.format(n ?? 0);

/** ₹1.2 L / ₹3.4 Cr for tight spaces like chart axes and KPI tiles. */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 1)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 1)} L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)} K`;
  return `₹${Math.round(n)}`;
}

export const number = (n: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(n ?? 0);

export function phone(p: string | null | undefined): string {
  if (!p) return "—";
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}
