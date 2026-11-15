/** Time conventions (data-contract §2). Times are UTC milliseconds since the Unix epoch. */

export const STEP_S = 600;
export const STEP_MS = STEP_S * 1000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const STAY_STEPS = (7 * 24 * 3600) / STEP_S; // 1,008 steps; both ends are sampled
export const N_SAMPLES = STAY_STEPS + 1;
export const SPAN_START = Date.UTC(2026, 10, 14); // Supported Span, inclusive
export const SPAN_END = Date.UTC(2027, 10, 14); // exclusive
export const N_LANDING_TIMES = (SPAN_END - SPAN_START) / STEP_MS;

const UTC_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

export function parseUtc(s: string): number {
  const m = UTC_RE.exec(s);
  if (!m) throw new Error(`not a UTC timestamp like 2027-03-01T00:00:00Z: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

export function formatUtc(t: number): string {
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The compact form used in results/ file names (data-contract §4): 20270301T0000Z. */
export function compactUtc(t: number): string {
  return formatUtc(t).replace(/[-:]/g, "").replace(/\d{2}Z$/, "Z");
}

export function checkLandingTime(t: number): void {
  if (!(t >= SPAN_START && t < SPAN_END)) {
    throw new Error(`Landing Time ${formatUtc(t)} is outside the Supported Span [${formatUtc(SPAN_START)}, ${formatUtc(SPAN_END)})`);
  }
  if ((t - SPAN_START) % STEP_MS !== 0) throw new Error(`Landing Time ${formatUtc(t)} is not on the 10-minute UTC grid`);
}

/** The nearest valid Landing Time: rounded to the 10-minute grid (half up) and clamped into the span. */
export function snapLandingTime(t: number): number {
  const k = Math.floor((t - SPAN_START) / STEP_MS + 0.5);
  return SPAN_START + Math.min(Math.max(k, 0), N_LANDING_TIMES - 1) * STEP_MS;
}
