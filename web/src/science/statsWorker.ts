/// <reference lib="webworker" />
/**
 * A helper worker for rankings (src/science/pool.ts): it holds one slice of a region's sites and returns their
 * Sun and Earth stats for a Surface Stay, so a ranking runs on several cores at once.
 */
import { BODIES, trackStats, type TrackSites } from "./geometry";
import { packStats, type PoolRequest, type PoolResponse } from "./pool";
import { STEP_S } from "./time";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let slice: { key: string; sites: TrackSites } | undefined;

ctx.onmessage = (ev: MessageEvent<PoolRequest>) => {
  const req = ev.data;
  if (req.type === "sites") { slice = { key: req.key, sites: req.sites }; return; }
  try {
    if (slice?.key !== req.key) throw new Error(`helper has sites for ${slice?.key}, not ${req.key}`);
    const positions = { start: 0, n: req.n, sun: req.sun, earth: req.earth };
    const out = new Float64Array((req.to - req.from) * BODIES.length * 9);
    for (let i = req.from; i < req.to; i++) {
      BODIES.forEach((b, bi) => packStats(out, ((i - req.from) * BODIES.length + bi) * 9, trackStats(slice!.sites, i, positions, b, STEP_S)));
    }
    ctx.postMessage({ id: req.id, stats: out } satisfies PoolResponse, [out.buffer]);
  } catch (e) {
    ctx.postMessage({ id: req.id, error: e instanceof Error ? e.message : String(e) } satisfies PoolResponse);
  }
};
