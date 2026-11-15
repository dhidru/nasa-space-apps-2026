// SPDX-License-Identifier: MIT
// Rankings, the 2 km-separated top 10, site details and Landing Windows, from the science client
// (src/science/client.ts: a Web Worker running the TypeScript port of the Python science; ADR 0001).
// This module only adds small caches and the shapes the UI wants. Coverage labels and colours, Landing Time
// rules and the link format come from src/app and src/science too.
import { science } from "../science/client.ts";

export { snapLandingTime, formatUtc, parseUtc, compactUtc, SPAN_START, SPAN_END, STAY_STEPS, STEP_MS, STEP_S, HOUR_MS, DAY_MS } from "../science/time.ts";
export { coverageLabel, coverageColor, pct, FULL_HIGH, PARTIAL_HIGH, PARTIAL_LOW, rgb, SUN_COLOR, EARTH_COLOR, LOS_COLOR, BLOCKED_COLOR } from "../app/coverage.ts";
export { DEFAULT_LANDING, parseRoute, formatRoute } from "../app/route.ts";

function lru(map, key, make, limit) {
  if (!map.has(key)) {
    const p = make();
    p.catch(() => map.delete(key));
    if (map.size >= limit) map.delete(map.keys().next().value);
    map.set(key, p);
  }
  return map.get(key);
}

const rankings = new Map(); // `${regionId}|${landing}` -> Promise<{doc, top, byId}>
/**
 * The ranking for a region and Landing Time (UTC ms on the 10-minute grid, inside the Supported Span).
 * Resolves to { doc, top: entries of the top 10 in rank order, byId: Map site_id -> entry }.
 */
export function ranking(regionId, landing, progress) {
  const hit = rankings.has(`${regionId}|${landing}`);
  const p = lru(rankings, `${regionId}|${landing}`, () => science.ranking(regionId, landing, progress).then((doc) => ({
    doc,
    top: doc.sites.filter((s) => s.top).sort((a, b) => a.rank - b.rank),
    byId: new Map(doc.sites.map((s) => [s.site_id, s])),
  })), 6);
  if (hit && progress) progress(1);
  return p;
}

const details = new Map();
/** Site detail over the Surface Stay: series, stats and Horizon (data-contract §7.2). */
export const detail = (regionId, landing, siteId) =>
  lru(details, `${regionId}|${landing}|${siteId}`, () => science.detail(regionId, landing, siteId), 8);

const windowsCache = new Map();
/** Landing Windows for a site over the whole Supported Span (data-contract §7.3). */
export const windows = (regionId, siteId) => lru(windowsCache, `${regionId}|${siteId}`, () => science.windows(regionId, siteId), 8);
