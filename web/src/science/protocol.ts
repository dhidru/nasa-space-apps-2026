/** Messages between the page and the science worker. */
import type { LandingWindowsDoc, RankingDoc, SiteDetailDoc } from "./results";

export type WorkerRequest =
  | { id: number; type: "ranking"; regionId: string; landing: number }
  | { id: number; type: "detail"; regionId: string; landing: number; siteId: string }
  | { id: number; type: "windows"; regionId: string; siteId: string }
  | { id: number; type: "darkDays"; regionId: string };

export type WorkerResponse =
  | { id: number; type: "progress"; fraction: number }
  | { id: number; type: "ranking"; doc: RankingDoc }
  | { id: number; type: "detail"; doc: SiteDetailDoc }
  | { id: number; type: "windows"; doc: LandingWindowsDoc }
  | { id: number; type: "darkDays"; doc: number[] }
  | { id: number; type: "error"; message: string };
