// SPDX-License-Identifier: MIT
// Rankings and the 2 km-separated top 10, computed in the browser by the team's TypeScript science port
// (web/src/science, Apache-2.0; ADR 0001). The viewer starts the same Web Worker as the team's web app and
// points it at its own copy of site-data, so both apps share one implementation and give the same answers.
// Coverage labels and colours also come from the web app (web/src/app/coverage.ts).

export { snapLandingTime, formatUtc, SPAN_START, SPAN_END, STAY_STEPS, STEP_MS } from "../../web/src/science/time.ts";
export { coverageLabel, coverageColor } from "../../web/src/app/coverage.ts";

// The worker reads files relative to the URL in its name (web/src/science/worker.ts).
const ROOT = new URL(`${import.meta.env.BASE_URL}site-data/`, document.baseURI).href;

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

const cache = new Map(); // `${regionId}|${landing}` -> Promise<{doc, top, byId}>

/**
 * The ranking for a region and Landing Time (UTC ms on the 10-minute grid, inside the Supported Span).
 * Resolves to { doc, top: entries of the top 10 in rank order, byId: Map site_id -> entry }.
 */
export function ranking(regionId, landing, progress) {
  const key = `${regionId}|${landing}`;
  if (!cache.has(key)) {
    const id = next++;
    const p = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, progress });
      getWorker().postMessage({ type: "ranking", regionId, landing, id });
    }).then((doc) => ({
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
