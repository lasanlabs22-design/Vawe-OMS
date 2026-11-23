// Calendar-day helpers for the browser and server pages ("YYYY-MM-DD", India time).

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Same day of the month, `n` months later (clamped to the month's last day). */
export function addMonths(day: string, n: number): string {
  const d = parse(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return fmt(target);
}

export const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

export const isDay = (v: string | undefined | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const TZ = { timeZone: "UTC" } as const;
export const dayLabel = (day: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...TZ }).format(parse(day));
export const dayLong = (day: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", ...TZ }).format(parse(day));
export const monthLabel = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", ...TZ }).format(parse(`${month}-01`));
export const monthLong = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", ...TZ }).format(parse(`${month}-01`));

/** Presets for range pickers, ending today. */
export function rangePresets(today = todayIST()) {
  return [
    { label: "This month", from: monthStart(today), to: today },
    { label: "Last 30 days", from: addDays(today, -29), to: today },
    { label: "Last 90 days", from: addDays(today, -89), to: today },
    { label: "Month to month", from: addMonths(today, -1), to: today },
  ];
}
