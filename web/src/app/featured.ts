/**
 * Featured Landing Time per region: the time a region map opens at when you pick the region from the home map, so a
 * first look already shows sites that keep the Sun and Earth in view for the whole 7-day stay.
 *
 * Each is the Landing Time in the Supported Span (on the hourly grid) at which the most sites in the region have Full
 * Coverage, found by scanning every site's hourly Sun and Earth Clearance over the span, then confirmed with a full
 * ranking (at least one site has Full Coverage). Recompute if the site data or the Supported Span change.
 */
import { parseUtc } from "../science/time";

// Computed 2026-11-15 from data/processed/site-data. Rechecked after the Horizons became the worst case over each
// site's 100 m circle (design.md §5): the times were not searched again, but the whole top 10 is still Full in every
// region. Sites with Full Coverage at that time:
const FEATURED: Record<string, string> = {
  "haworth": "2027-08-19T23:00:00Z",            // 4,371
  "malapert-massif": "2026-11-20T10:00:00Z",    // 4,771
  "mons-mouton": "2026-11-20T00:00:00Z",        // 2,001
  "nobile-rim-1": "2027-11-06T23:00:00Z",       //   651
  "nobile-rim-2": "2027-11-06T22:00:00Z",       // 3,265
  "peak-near-cabeus-b": "2026-11-21T21:00:00Z", // 2,370
  "de-gerlache-rim-2": "2027-10-15T07:00:00Z",  // 6,064
  "slater-plain": "2027-02-10T09:00:00Z",       // 1,424
};

/** The Featured Landing Time (UTC ms) for a region, or undefined if it has none. */
export function featuredLanding(regionId: string): number | undefined {
  const s = FEATURED[regionId];
  return s ? parseUtc(s) : undefined;
}
