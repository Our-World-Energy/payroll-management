// Shared Sun→Sat week helpers used by Attendance Management and Payroll so
// both pages select/label weeks identically.

export function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const current = parseIsoDate(from);
  const end = parseIsoDate(to);

  while (current <= end) {
    dates.push(toIsoDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function addDaysIso(iso: string, days: number) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

// Snap any date to the Sunday that starts its week.
export function sundayOf(iso: string) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - d.getDay());
  return toIsoDate(d);
}

// Today's calendar date in Arizona (America/Phoenix, no DST), as YYYY-MM-DD.
export function arizonaTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// The most recent N weeks (Sun→Sat), most-recent first, anchored to the
// current Arizona week. e.g. on 2026-07-01 → ["2026-06-28", "2026-06-21", …].
export function recentWeeks(count = 12): string[] {
  const currentSunday = sundayOf(arizonaTodayIso());
  return Array.from({ length: count }, (_, i) => addDaysIso(currentSunday, -7 * i));
}

export function weekLabel(iso: string): string {
  const start = new Date(`${iso}T00:00:00.000Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = (d: Date) => d.getUTCDate();
  return mo(start) === mo(end) ? `${mo(start)} ${day(start)} – ${day(end)}` : `${mo(start)} ${day(start)} – ${mo(end)} ${day(end)}`;
}
