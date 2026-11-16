/**
 * No-Full-Stay Days: UTC days of the Supported Span on which no Landing Time gives any site of a region Full
 * Coverage (Sun and Earth Clearance > 0 at every sample of the 7-day Surface Stay). The region map's calendar
 * crosses these days out; they can still be picked.
 *
 * Checking every site at every 10-minute Landing Time is ~50x a ranking per site, so the work is cut in two:
 *  1. A coarse pass samples each site once an hour (every COARSE-th sample). A Landing Time can only be Full
 *     if every hourly sample inside its stay is positive, so runs of positive hourly samples give the only
 *     candidate Landing Times. Earth is checked first because a site that never sees Earth for 7 days is out.
 *  2. Each candidate day that isn't already known to work is checked at full resolution.
 * Sites stop being checked once every day is known to work.
 */
import type { Positions, Region } from "./data";
import { clearance, track } from "./geometry";
import { DAY_MS, N_LANDING_TIMES, N_SAMPLES, SPAN_END, SPAN_START, STAY_STEPS, STEP_MS } from "./time";

const STEPS_PER_DAY = DAY_MS / STEP_MS; // 144
const COARSE = 6; // hourly

/** Every COARSE-th sample of `p`, as a Positions that track() can read. */
function subsample(p: Positions, step: number): Positions {
  const n = Math.floor((p.n - 1) / step) + 1;
  const pick = (v: Float64Array) => {
    const out = new Float64Array(n * 3);
    for (let k = 0; k < n; k++) out.set(v.subarray(k * step * 3, k * step * 3 + 3), k * 3);
    return out;
  };
  return { start: p.start, n, sun: pick(p.sun), earth: pick(p.earth) };
}

/** min(Sun, Earth) Clearance at samples [from, from + n) of `positions` for one site. */
function worst(region: Region, site: number, positions: Positions, from: number, n: number): Float64Array {
  const s = clearance(track(region, site, positions, "sun", from, n));
  const e = clearance(track(region, site, positions, "earth", from, n));
  for (let k = 0; k < n; k++) if (e[k] < s[k]) s[k] = e[k];
  return s;
}

/** True if some Landing Time j in [j0, j1] has every sample of [j, j + STAY_STEPS] positive for this site. */
function fullAt(region: Region, site: number, span: Positions, j0: number, j1: number): boolean {
  const w = worst(region, site, span, j0, j1 - j0 + N_SAMPLES);
  let run = 0; // length of the positive run ending at sample k
  for (let k = 0; k < w.length; k++) {
    run = w[k] > 0 ? run + 1 : 0;
    if (run >= N_SAMPLES && k - STAY_STEPS >= 0) return true; // stay [k − STAY_STEPS, k] starts at j0 + k − STAY_STEPS ≤ j1
  }
  return false;
}

/** Called with the fraction of sites checked (0–1). */
export type Progress = (fraction: number) => void;

/** Start (UTC ms) of each No-Full-Stay Day in the Supported Span; `span` comes from loadSpanPositions. */
export function computeNoFullStayDays(region: Region, span: Positions, progress?: Progress): number[] {
  if (span.start !== SPAN_START || span.n !== N_LANDING_TIMES + STAY_STEPS) throw new Error("positions must cover the Supported Span");
  const nDays = (SPAN_END - SPAN_START) / DAY_MS;
  const ok = new Uint8Array(nDays); // 1 once some site has a Full Coverage Landing Time that day
  let left = nDays;
  const coarse = subsample(span, COARSE);
  const stayCoarse = STAY_STEPS / COARSE; // 168 hourly steps in a stay
  const nSites = region.siteIds.length;
  for (let i = 0; i < nSites && left > 0; i++) {
    if (progress && i % 128 === 127) progress((i + 1) / nSites);
    // Earth first: skip the site unless some hourly run of Earth Clearance > 0 lasts a whole stay.
    const earth = clearance(track(region, i, coarse, "earth"));
    let run = 0, longest = 0;
    for (let k = 0; k < earth.length; k++) { run = earth[k] > 0 ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest < stayCoarse) continue; // a stay off the hour holds exactly stayCoarse hourly samples
    const w = worst(region, i, coarse, 0, coarse.n);
    // Runs of positive hourly samples [a, b] (coarse indices). Landing Time j (fine) is a candidate when its stay
    // [j, j + STAY_STEPS] holds no non-positive hourly sample: j > (a − 1)·COARSE and j + STAY_STEPS < (b + 1)·COARSE.
    for (let a = 0; a < w.length;) {
      if (!(w[a] > 0)) { a++; continue; }
      let b = a;
      while (b + 1 < w.length && w[b + 1] > 0) b++;
      const j0 = Math.max(0, (a - 1) * COARSE + 1), j1 = Math.min(N_LANDING_TIMES - 1, (b + 1) * COARSE - 1 - STAY_STEPS);
      for (let d = Math.floor(j0 / STEPS_PER_DAY); j1 >= j0 && d <= Math.floor(j1 / STEPS_PER_DAY); d++) {
        if (ok[d]) continue;
        const lo = Math.max(j0, d * STEPS_PER_DAY), hi = Math.min(j1, (d + 1) * STEPS_PER_DAY - 1);
        if (fullAt(region, i, span, lo, hi)) { ok[d] = 1; left--; }
      }
      a = b + 1;
    }
  }
  progress?.(1);
  const out: number[] = [];
  for (let d = 0; d < nDays; d++) if (!ok[d]) out.push(SPAN_START + d * DAY_MS);
  return out;
}

/** The Landing Time on one UTC day at which the most sites look Full on the hourly samples, and how many. */
export type DayBest = { landing: number; sites: number };

/**
 * The best Landing Time on UTC day `day` (ms) for the "jump to the next day that works" button: the hour (on the
 * 10-minute grid) at which the most sites keep Sun and Earth Clearance > 0 at every hourly sample of the stay. Hourly
 * samples can miss a short dip, so callers confirm with a ranking. `coarse` is the span sampled hourly (hourlySpan).
 * Checks one day plus its 7-day stays, so it takes well under a second even for the largest region.
 */
export function bestLandingOnDay(region: Region, coarse: Positions, day: number): DayBest | null {
  const d = Math.round((day - SPAN_START) / DAY_MS);
  const hoursPerDay = 24, stayCoarse = STAY_STEPS / COARSE;
  const from = d * hoursPerDay, n = Math.min(hoursPerDay + stayCoarse, coarse.n - from);
  if (d < 0 || n <= stayCoarse) return null;
  const counts = new Int32Array(hoursPerDay);
  for (let i = 0; i < region.siteIds.length; i++) {
    const w = worst(region, i, coarse, from, n);
    let run = 0; // positive run starting at sample k, counted from the end
    for (let k = n - 1; k >= 0; k--) {
      run = w[k] > 0 ? run + 1 : 0;
      if (k < hoursPerDay && run > stayCoarse) counts[k]++; // stay [k, k + stayCoarse] all positive
    }
  }
  let best = 0;
  for (let k = 1; k < hoursPerDay; k++) if (counts[k] > counts[best]) best = k;
  return counts[best] ? { landing: SPAN_START + (from + best) * COARSE * STEP_MS, sites: counts[best] } : null;
}

/** The Supported Span sampled once an hour, for bestLandingOnDay. */
export const hourlySpan = (span: Positions): Positions => subsample(span, COARSE);
