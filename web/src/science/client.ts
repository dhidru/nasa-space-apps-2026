/** Promise-based client for the science worker. */
import { dataRootFromPage } from "./fetchSiteData";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { LandingWindowsDoc, RankingDoc, SiteDetailDoc } from "./results";
import type { DayBest } from "./fullstay";

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; progress?: (f: number) => void };

// Distributive Omit, so each request variant keeps its own fields.
type Request = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

class ScienceClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: dataRootFromPage() });
  private next = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") return p.progress?.(msg.fraction);
      this.pending.delete(msg.id);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else p.resolve(msg.doc);
    };
  }

  private call<T>(req: Request, progress?: (f: number) => void): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      this.worker.postMessage({ ...req, id });
    });
  }

  ranking(regionId: string, landing: number, progress?: (f: number) => void): Promise<RankingDoc> {
    return this.call({ type: "ranking", regionId, landing }, progress);
  }

  detail(regionId: string, landing: number, siteId: string): Promise<SiteDetailDoc> {
    return this.call({ type: "detail", regionId, landing, siteId });
  }

  windows(regionId: string, siteId: string): Promise<LandingWindowsDoc> {
    return this.call({ type: "windows", regionId, siteId });
  }

  /** Start (UTC ms) of each day in the Supported Span with no sunlight anywhere in the region. */
  darkDays(regionId: string): Promise<number[]> {
    return this.call({ type: "darkDays", regionId });
  }

  /** The Landing Time on a UTC day (ms) at which the most sites look Full (src/science/fullstay.ts bestLandingOnDay). */
  bestOnDay(regionId: string, day: number): Promise<DayBest | null> {
    return this.call({ type: "bestOnDay", regionId, day });
  }

  /** Start (UTC ms) of each day in the Supported Span with no Full Coverage Landing Time at any site (src/science/fullstay.ts). */
  noFullStayDays(regionId: string, progress?: (f: number) => void): Promise<number[]> {
    return this.call({ type: "noFullStayDays", regionId }, progress);
  }
}

export const science = new ScienceClient();
/**
 * A second worker for the long whole-year scans (No-Full-Stay Days, ~30-60 s per region). A worker runs one
 * request at a time, so on the main worker a scan would hold back the ranking the user is waiting for.
 */
export const scanner = new ScienceClient();
