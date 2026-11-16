/** Typed 24-hour UTC times (no AM/PM anywhere), shared by the region map's Landing Time box and the site view's form. */

/**
 * Seconds after midnight from a typed 24-hour time: "hh:mm:ss", "hh:mm", "hhmmss", "hhmm" or "hh" (missing parts
 * are 00). Null when it can't be read or is out of range.
 */
export function parseHms(text: string | null | undefined): number | null {
  const t = /^\s*(\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?\s*$/.exec(text ?? "");
  if (!t) return null;
  const [h, m, s] = [t[1], t[2] ?? 0, t[3] ?? 0].map(Number);
  return h > 23 || m > 59 || s > 59 ? null : h * 3600 + m * 60 + s;
}

/** "hh:mm" for seconds after midnight (the Sun and Earth data are every 10 minutes, so the time fields show no seconds). */
export const hm = (sec: number): string => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** "hh:mm:ss" for seconds after midnight. */
export const hms = (sec: number): string => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** A UTC instant from a typed date (yyyy-mm-dd) and time (parseHms); Invalid Date if either can't be read. */
export function parseDateTime(dateText: string | null | undefined, timeText: string | null | undefined): Date {
  const d = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(dateText ?? "");
  const sec = parseHms(timeText || "00:00:00");
  if (!d || sec === null) return new Date(NaN);
  const [y, mo, da] = [d[1], d[2], d[3]].map(Number);
  if (mo < 1 || mo > 12 || da < 1) return new Date(NaN);
  const ms = Date.UTC(y, mo - 1, da) + sec * 1000;
  return new Date(Date.UTC(y, mo - 1, da)).getUTCDate() === da ? new Date(ms) : new Date(NaN); // rejects 2027-02-30
}
