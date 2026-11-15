/// <reference lib="webworker" />
/**
 * Runs the science code off the main thread (ADR 0001). It keeps the last region, Sun/Earth year
 * files, span positions and ranking in memory so repeat requests are fast.
 */
import { loadPositions, loadRegion, type Positions, type PositionsCache, type Region } from "./data";
import { computeLandingWindows, computeRanking, computeSiteDetail, loadSpanPositions, type RankingDoc } from "./results";
import { N_SAMPLES } from "./time";
import { computeDarkDays } from "./darkness";
import { computeNoFullStayDays } from "./fullstay";
import { fetchSiteData } from "./fetchSiteData";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
// The page passes the data/ URL as the worker name (see client.ts).
const read = fetchSiteData(ctx.name);
const positionsCache: PositionsCache = new Map();
let region: { id: string; data: Promise<Region> } | undefined;
let span: Promise<Positions> | undefined;
const rankings = new Map<string, RankingDoc>(); // `${regionId}|${landing}`, last few only

function getRegion(id: string): Promise<Region> {
  if (region?.id !== id) {
    region = { id, data: loadRegion(read, id) };
    rankings.clear();
  }
  return region.data;
}

async function ranking(regionId: string, landing: number, id: number): Promise<RankingDoc> {
  const key = `${regionId}|${landing}`;
  const hit = rankings.get(key);
  if (hit) return hit;
  const r = await getRegion(regionId);
  const positions = await loadPositions(read, landing, N_SAMPLES, positionsCache);
  const doc = computeRanking(r, positions, landing, (fraction) => post({ id, type: "progress", fraction }));
  if (rankings.size >= 4) rankings.delete(rankings.keys().next().value!);
  rankings.set(key, doc);
  return doc;
}

function post(msg: WorkerResponse): void {
  ctx.postMessage(msg);
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.type) {
      case "ranking":
        post({ id: req.id, type: "ranking", doc: await ranking(req.regionId, req.landing, req.id) });
        break;
      case "detail": {
        const doc = await ranking(req.regionId, req.landing, req.id);
        const entry = doc.sites.find((s) => s.site_id === req.siteId);
        if (!entry) throw new Error(`no site ${req.siteId}`);
        const r = await getRegion(req.regionId);
        const positions = await loadPositions(read, req.landing, N_SAMPLES, positionsCache);
        post({ id: req.id, type: "detail", doc: computeSiteDetail(r, positions, req.landing, req.siteId, entry) });
        break;
      }
      case "windows": {
        const r = await getRegion(req.regionId);
        span ??= loadSpanPositions(read, positionsCache);
        post({ id: req.id, type: "windows", doc: computeLandingWindows(r, await span, req.siteId) });
        break;
      }
      case "darkDays": {
        const r = await getRegion(req.regionId);
        span ??= loadSpanPositions(read, positionsCache);
        post({ id: req.id, type: "darkDays", doc: computeDarkDays(r, await span) });
        break;
      }
      case "noFullStayDays": {
        const r = await getRegion(req.regionId);
        span ??= loadSpanPositions(read, positionsCache);
        const doc = computeNoFullStayDays(r, await span, (fraction) => post({ id: req.id, type: "progress", fraction }));
        post({ id: req.id, type: "noFullStayDays", doc });
        break;
      }
    }
  } catch (e) {
    post({ id: req.id, type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
