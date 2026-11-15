/**
 * Splits a ranking's per-site work over a few helper workers (src/science/statsWorker.ts), one contiguous slice
 * of the region's sites each. A ranking is ~45 M Sun/Earth samples (22,000 sites × 2 bodies × 1,009 steps), so
 * one core takes seconds; the helpers share it. The results are the same numbers computeRanking() gives.
 */
import type { Positions, Region } from "./data";
import { BODIES, type Body, type TrackSites } from "./geometry";
import type { BodyStats } from "./scoring";

export type PoolRequest =
  | { type: "sites"; key: string; sites: TrackSites }
  | { type: "stats"; id: number; key: string; from: number; to: number; n: number; sun: Float64Array; earth: Float64Array };
export type PoolResponse = { id: number; stats: Float64Array } | { id: number; error: string };

/** Thrown when a newer ranking took over before this one finished. */
export class Superseded extends Error {
  constructor() { super("superseded by a newer ranking"); }
}

/** BodyStats as 9 numbers at out[at…at+8], so a helper can send many in one buffer. */
export function packStats(out: Float64Array, at: number, s: BodyStats): void {
  out[at] = s.minElevationDeg; out[at + 1] = s.meanElevationDeg; out[at + 2] = s.maxElevationDeg;
  out[at + 3] = s.minClearanceDeg; out[at + 4] = s.meanClearanceDeg; out[at + 5] = s.maxClearanceDeg;
  out[at + 6] = s.losFraction; out[at + 7] = s.losDurationH; out[at + 8] = s.firstLosLossIndex;
}
function unpackStats(a: Float64Array, at: number): BodyStats {
  return {
    minElevationDeg: a[at], meanElevationDeg: a[at + 1], maxElevationDeg: a[at + 2],
    minClearanceDeg: a[at + 3], meanClearanceDeg: a[at + 4], maxClearanceDeg: a[at + 5],
    losFraction: a[at + 6], losDurationH: a[at + 7], firstLosLossIndex: a[at + 8],
  };
}

/** Sites handed to a helper per message: small enough that a superseded ranking stops within ~0.1 s. */
const CHUNK = 512;

interface Helper { worker: Worker; from: number; to: number }

export class StatsPool {
  private helpers: Helper[] = [];
  private key: string | undefined;
  private next = 1;
  private pending = new Map<number, { resolve: (a: Float64Array) => void; reject: (e: Error) => void }>();

  constructor(private size: number) {}

  /**
   * Every site's Sun and Earth stats over `positions` (site order). `cancelled` is checked between chunks;
   * once it returns true the call rejects with Superseded. `progress` gets the fraction of sites done.
   */
  async stats(region: Region, positions: Positions, cancelled: () => boolean, progress?: (f: number) => void): Promise<Record<Body, BodyStats[]>> {
    this.useRegion(region);
    const n = region.siteIds.length;
    const out: Record<Body, BodyStats[]> = { sun: new Array(n), earth: new Array(n) };
    let done = 0;
    const key = this.key!;
    await Promise.all(this.helpers.map(async (h) => {
      for (let from = h.from; from < h.to; from += CHUNK) {
        if (cancelled()) throw new Superseded();
        const to = Math.min(from + CHUNK, h.to);
        const a = await this.send(h, { type: "stats", key, from: from - h.from, to: to - h.from, n: positions.n, sun: positions.sun, earth: positions.earth });
        for (let i = from; i < to; i++) {
          BODIES.forEach((b, bi) => { out[b][i] = unpackStats(a, ((i - from) * BODIES.length + bi) * 9); });
        }
        done += to - from;
        progress?.(done / n);
      }
    }));
    if (cancelled()) throw new Superseded();
    return out;
  }

  /** Give each helper its slice of the region (once per region). */
  private useRegion(region: Region): void {
    if (this.key === region.regionId) return;
    this.key = region.regionId;
    if (!this.helpers.length) {
      for (let k = 0; k < this.size; k++) {
        const worker = new Worker(new URL("./statsWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (ev: MessageEvent<PoolResponse>) => {
          const p = this.pending.get(ev.data.id);
          if (!p) return;
          this.pending.delete(ev.data.id);
          if ("error" in ev.data) p.reject(new Error(ev.data.error)); else p.resolve(ev.data.stats);
        };
        this.helpers.push({ worker, from: 0, to: 0 });
      }
    }
    const n = region.siteIds.length, nAz = region.horizons.nAzimuths;
    this.helpers.forEach((h, k) => {
      h.from = Math.floor((k * n) / this.size);
      h.to = Math.floor(((k + 1) * n) / this.size);
      const sites: TrackSites = {
        latDeg: region.latDeg.slice(h.from, h.to),
        lonDeg: region.lonDeg.slice(h.from, h.to),
        observerAboveSphereM: region.observerAboveSphereM.slice(h.from, h.to),
        horizons: { values: region.horizons.values.slice(h.from * nAz, h.to * nAz), scale: region.horizons.scale, nAzimuths: nAz },
      };
      const msg: PoolRequest = { type: "sites", key: region.regionId, sites };
      h.worker.postMessage(msg, [sites.latDeg.buffer, sites.lonDeg.buffer, sites.observerAboveSphereM.buffer, sites.horizons.values.buffer]);
    });
  }

  private send(h: Helper, req: Omit<Extract<PoolRequest, { type: "stats" }>, "id">): Promise<Float64Array> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      h.worker.postMessage({ ...req, id } satisfies PoolRequest);
    });
  }
}
