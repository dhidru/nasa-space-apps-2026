/** Landing Slope in the UI: its label, and the top 10 limited to sites under a slope limit (design.md §12). */
import type { Region } from "../science/data";
import { TOP_N, TOP_SEPARATION_M, type RankingEntry } from "../science/results";
import { selectTop } from "../science/scoring";

/** The choices for the top-10 slope limit, in degrees: NASA's landing limit (HLS25 slide 21) and its 8° contour (slide 23). */
export const SLOPE_LIMITS_DEG = [10, 8] as const;
export const DEFAULT_SLOPE_LIMIT_DEG = 10;

/** Tooltip wherever Landing Slope is shown (GLOSSARY.md). */
export const SLOPE_TITLE =
  "Landing Slope: the steepest 100 m-scale slope anywhere in the site's 100 m circle (NASA's landing limit is under 10°)";

/** Landing Slope rounded down to 0.1°, so a site under a limit never reads as the limit; "—" if not computed. */
export function slopeLabel(deg: number | undefined): string {
  if (deg === undefined) return "—";
  return `${(Math.floor(deg * 10 + 1e-9) / 10).toFixed(1)}°`;
}

/** True when a site's Landing Slope is under the limit; a missing slope never is. A null limit lets every site through. */
export function underSlopeLimit(slopeDeg: number | undefined, maxSlopeDeg: number | null): boolean {
  return maxSlopeDeg === null || (slopeDeg !== undefined && slopeDeg < maxSlopeDeg);
}

/**
 * The top 10 (2 km apart, like the ranking's own) among the sites whose Landing Slope is under `maxSlopeDeg`.
 * `entries` are the ranking's entries in rank order. A null limit, or a region without Landing Slopes, filters
 * nothing. The ranking itself is unchanged; only the choice of top 10 differs.
 */
export function topWithinSlope(entries: RankingEntry[], region: Pick<Region, "siteIndex" | "xM" | "yM" | "landingSlopeDeg">,
  maxSlopeDeg: number | null): RankingEntry[] {
  const slope = maxSlopeDeg === null ? null : region.landingSlopeDeg;
  const order: number[] = [];
  const entryOf = new Map<number, RankingEntry>();
  for (const e of entries) {
    const i = region.siteIndex.get(e.site_id);
    if (i === undefined || (slope && !underSlopeLimit(slope[i], maxSlopeDeg))) continue;
    order.push(i);
    entryOf.set(i, e);
  }
  return selectTop(order, region.xM, region.yM, TOP_N, TOP_SEPARATION_M).map((i) => entryOf.get(i)!);
}
