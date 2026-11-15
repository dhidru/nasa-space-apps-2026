// SPDX-License-Identifier: MIT
// Rankings and the 2 km-separated top 10, computed in the browser by the team's TypeScript science port
// (web/src/science, Apache-2.0; ADR 0001). The viewer starts the same Web Worker as the team's web app and
// points it at the same data/ folder, so both apps share one implementation and give the same answers.
// Coverage labels and colours also come from the web app (web/src/app/coverage.ts).

export { snapLandingTime, formatUtc, parseUtc, SPAN_START, SPAN_END, STAY_STEPS, STEP_MS, HOUR_MS, DAY_MS } from "../../web/src/science/time.ts";
export { coverageLabel, coverageColor, pct, FULL_HIGH, PARTIAL_HIGH, PARTIAL_LOW, rgb, SUN_COLOR, EARTH_COLOR, LOS_COLOR, BLOCKED_COLOR } from "../../web/src/app/coverage.ts";
export { DEFAULT_LANDING } from "../../web/src/app/route.ts";

import { DATA_ROOT as ROOT } from "./teamdata.js";
// The worker reads files relative to the URL in its name (web/src/science/worker.ts): the same data/ folder.

let worker = null, next = 1;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  // The name (data root) isn't static, which Vite 5 needs to be told; the worker is bundled as a classic script.
  worker = new Worker(new URL("../../web/src/science/worker.ts", import.meta.url), /* @vite-ignore */ { name: ROOT });
  worker.onmessage = (ev) => {
    const msg = ev.data, p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") { p.progress && p.progress(msg.fraction); return; }
    pending.delete(msg.id);
    if (msg.type === "error") p.reject(new Error(msg.message)); else p.resolve(msg.doc);
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || "science worker failed")); pending.clear(); };
  return worker;
}

function call(req, progress) {
  const id = next++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    getWorker().postMessage({ ...req, id });
  });
}

const cache = new Map(); // `${regionId}|${landing}` -> Promise<{doc, top, byId}>

/**
 * The ranking for a region and Landing Time (UTC ms on the 10-minute grid, inside the Supported Span).
 * Resolves to { doc, top: entries of the top 10 in rank order, byId: Map site_id -> entry }.
 */
export function ranking(regionId, landing, progress) {
  const key = `${regionId}|${landing}`;
  if (!cache.has(key)) {
    const p = call({ type: "ranking", regionId, landing }, progress).then((doc) => ({
      doc,
      top: doc.sites.filter((s) => s.top).sort((a, b) => a.rank - b.rank),
      byId: new Map(doc.sites.map((s) => [s.site_id, s])),
    }));
    p.catch(() => cache.delete(key));
    if (cache.size >= 6) cache.delete(cache.keys().next().value);
    cache.set(key, p);
  } else if (progress) {
    progress(1);
  }
  return cache.get(key);
}

/** Site detail over the Surface Stay (series, stats, Horizon) from the web app's worker (data-contract §7.2). */
const details = new Map();
export function detail(regionId, landing, siteId) {
  const key = `${regionId}|${landing}|${siteId}`;
  if (!details.has(key)) {
    const p = call({ type: "detail", regionId, landing, siteId });
    p.catch(() => details.delete(key));
    if (details.size >= 8) details.delete(details.keys().next().value);
    details.set(key, p);
  }
  return details.get(key);
}

/** Landing Windows for a site over the whole Supported Span (data-contract §7.3). */
const windowsCache = new Map();
export function windows(regionId, siteId) {
  const key = `${regionId}|${siteId}`;
  if (!windowsCache.has(key)) {
    const p = call({ type: "windows", regionId, siteId });
    p.catch(() => windowsCache.delete(key));
    windowsCache.set(key, p);
  }
  return windowsCache.get(key);
}
