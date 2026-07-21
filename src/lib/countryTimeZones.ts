// Shared country → IANA time zone mapping, and the Arizona-equivalent-date
// conversion used for the Holidays table's arizonaDate/timeZone columns and
// the Holiday Calendar's regional mini-calendars.

export const COUNTRY_TIME_ZONES: Record<string, string> = {
  "United States": "America/Phoenix",
  "India": "Asia/Kolkata",
  "Mexico": "America/Mexico_City",
  "Philippines": "Asia/Manila",
  "Guatemala": "America/Guatemala",
  "Colombia": "America/Bogota",
};

export const ARIZONA_TIME_ZONE = "America/Phoenix";

export function timeZoneForCountry(country: string): string | null {
  return COUNTRY_TIME_ZONES[country] ?? null;
}

// `location` is stored as free text like "Jalisco, Mexico" or just
// "Philippines" — the country is always the last comma-separated part.
export function countryFromLocation(location: string): string {
  const parts = location.split(",");
  return parts[parts.length - 1]?.trim() || "-";
}

// The UTC instant corresponding to `hour`:`minute` on `dateIso` as observed
// in `timeZone`. Standard "zoned wall-clock time → UTC" conversion via Intl,
// so it holds even for zones that observe DST. `hour`/`minute` may overflow
// (e.g. minute 65) — Date.UTC normalizes that correctly.
export function utcInstantForLocalTime(dateIso: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(utcGuess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  const offsetMs = wallAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

function utcInstantForMidnightInTz(dateIso: string, timeZone: string): Date {
  return utcInstantForLocalTime(dateIso, 0, 0, timeZone);
}

// Wall-clock date+time parts as observed in `timeZone` at the given instant.
function wallTimePartsInTz(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

// The Arizona local date+time corresponding to midnight of `dateIso` in the
// holiday's own country, as a "naive" Date carrying Arizona wall-clock
// values (via the UTC-constructor trick, so writing it to a Postgres
// TIMESTAMP WITHOUT TIME ZONE column stores that exact wall-clock value).
// E.g. a Jan 1 holiday in the Philippines (UTC+8) starts at 9:00 AM the
// prior day in Arizona (UTC-7) — this returns Dec 31, 09:00.
// Returns null when the country has no known time zone mapping.
export function arizonaDateForCountryDate(dateIso: string, country: string): Date | null {
  const countryTz = timeZoneForCountry(country);
  if (!countryTz) return null;
  const instant = utcInstantForMidnightInTz(dateIso, countryTz);
  const p = wallTimePartsInTz(instant, ARIZONA_TIME_ZONE);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

function offsetMinutesAtInstant(instant: Date, timeZone: string): number {
  const p = wallTimePartsInTz(instant, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (wallAsUtc - instant.getTime()) / 60000;
}

// Hours the holiday's own local time is ahead of (positive) or behind
// (negative) Arizona time, at midnight of `dateIso`. Can be fractional
// (e.g. India is 12.5h ahead of Arizona). Returns null when the country
// has no known time zone mapping.
export function hourOffsetDifference(dateIso: string, country: string): number | null {
  const countryTz = timeZoneForCountry(country);
  if (!countryTz) return null;
  const instant = utcInstantForMidnightInTz(dateIso, countryTz);
  const countryOffsetMin = offsetMinutesAtInstant(instant, countryTz);
  const arizonaOffsetMin = offsetMinutesAtInstant(instant, ARIZONA_TIME_ZONE);
  return (countryOffsetMin - arizonaOffsetMin) / 60;
}
