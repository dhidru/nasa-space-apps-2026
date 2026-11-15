/**
 * Dark Days: UTC days of the Supported Span when no site of a region sees the Sun at any 10-minute
 * sample (Sun Clearance <= 0 everywhere, all day). The region map's calendar blacks these out.
 */
import type { Positions, Region } from "./data";
import { track } from "./geometry";
import { DAY_MS, N_LANDING_TIMES, SPAN_END, SPAN_START, STAY_STEPS, STEP_MS } from "./time";

const STEPS_PER_DAY = DAY_MS / STEP_MS; // 144

/** True if some site of `region` has the Sun above its terrain horizon at a sample of [from, from + n). */
export function anySunlit(region: Region, positions: Positions, from: number, n: number): boolean {
  const nSites = region.siteIds.length;
  for (let i = 0; i < nSites; i++) {
    const t = track(region, i, positions, "sun", from, n);
    for (let k = 0; k < n; k++) if (t.elevationDeg[k] - t.horizonElevationDeg[k] > 0) return true;
  }
  return false;
}

/** Start (UTC ms) of each fully dark day in the Supported Span; `span` comes from loadSpanPositions. */
export function computeDarkDays(region: Region, span: Positions): number[] {
  if (span.start !== SPAN_START || span.n !== N_LANDING_TIMES + STAY_STEPS) throw new Error("positions must cover the Supported Span");
  const dark: number[] = [];
  for (let day = SPAN_START; day < SPAN_END; day += DAY_MS) {
    const from = (day - SPAN_START) / STEP_MS;
    if (!anySunlit(region, span, from, STEPS_PER_DAY)) dark.push(day);
  }
  return dark;
}
