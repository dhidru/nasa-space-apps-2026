/**
 * The three results documents of data-contract §7, built in the browser (ADR 0001).
 * Mirrors src/pipeline/results.py; the committed Python results are the golden fixtures.
 */
import { loadPositions, type Positions, type PositionsCache, type ReadBytes, type Region } from "./data";
import { BODIES, clearance, track, trackStats, type Body } from "./geometry";
import { landingWindows, rankSites, selectTop, type BodyStats } from "./scoring";
import { checkLandingTime, formatUtc, N_LANDING_TIMES, N_SAMPLES, SPAN_END, SPAN_START, STAY_STEPS, STEP_MS, STEP_S } from "./time";

export const SCHEMA_VERSION = 1;
export const TOP_N = 10;
export const TOP_SEPARATION_M = 2000;
export const MERGE_GAP_H = 24;

export type Coverage = "full" | "partial";

export interface StatsDoc {
  min_elevation_deg: number;
  mean_elevation_deg: number;
  max_elevation_deg: number;
  min_clearance_deg: number;
  mean_clearance_deg: number;
  max_clearance_deg: number;
  los_fraction: number;
  los_duration_h: number;
  first_los_loss_utc: string | null;
}

export interface StayHeader {
  schema_version: number;
  mock: boolean;
  region_id: string;
  landing_time_utc: string;
  stay_end_utc: string;
  step_s: number;
  n_samples: number;
}

export interface RankingEntry {
  site_id: string;
  rank: number;
  coverage: Coverage;
  worst_case_min_clearance_deg: number;
  top: boolean;
  sun: StatsDoc;
  earth: StatsDoc;
}

export interface RankingDoc extends StayHeader {
  observer_height_m: number;
  top_n: number;
  top_separation_m: number;
  sites: RankingEntry[];
}

/** Like Python's round(v, nd) for the values we write (ties are vanishingly rare in these data). */
export function roundTo(v: number, nd = 3): number {
  return Number(v.toFixed(nd));
}

function stayHeader(region: Region, landing: number): StayHeader {
  return {
    schema_version: SCHEMA_VERSION, mock: false, region_id: region.regionId,
    landing_time_utc: formatUtc(landing), stay_end_utc: formatUtc(landing + STAY_STEPS * STEP_MS),
    step_s: STEP_S, n_samples: N_SAMPLES,
  };
}

function statsDoc(s: BodyStats, landing: number): StatsDoc {
  return {
    min_elevation_deg: roundTo(s.minElevationDeg), mean_elevation_deg: roundTo(s.meanElevationDeg),
    max_elevation_deg: roundTo(s.maxElevationDeg), min_clearance_deg: roundTo(s.minClearanceDeg),
    mean_clearance_deg: roundTo(s.meanClearanceDeg), max_clearance_deg: roundTo(s.maxClearanceDeg),
    los_fraction: roundTo(s.losFraction, 4), los_duration_h: roundTo(s.losDurationH, 2),
    first_los_loss_utc: s.firstLosLossIndex < 0 ? null : formatUtc(landing + s.firstLosLossIndex * STEP_MS),
  };
}

function toCoverage(full: boolean): Coverage {
  return full ? "full" : "partial";
}

function siteIndexOf(region: Region, siteId: string): number {
  const i = region.siteIndex.get(siteId);
  if (i === undefined) throw new Error(`no site ${siteId} in ${region.regionId}`);
  return i;
}

function checkStay(positions: Positions, landing: number): void {
  checkLandingTime(landing);
  if (positions.start !== landing || positions.n !== N_SAMPLES) throw new Error("positions must cover the Surface Stay from the Landing Time");
}

/** Called with the fraction done (0–1) while a ranking is computed. */
export type Progress = (fraction: number) => void;

/** The ranking document (§7.1): every site, ranked. `positions` covers the stay from `landing`. */
export function computeRanking(region: Region, positions: Positions, landing: number, progress?: Progress): RankingDoc {
  checkStay(positions, landing);
  const n = region.siteIds.length;
  const stats: Record<Body, BodyStats[]> = { sun: [], earth: [] };
  for (let i = 0; i < n; i++) {
    for (const b of BODIES) stats[b].push(trackStats(region, i, positions, b, STEP_S));
    if (progress && i % 256 === 255) progress((i + 1) / n);
  }
  return assembleRanking(region, landing, stats);
}

/** The ranking document from every site's Sun and Earth stats (in site order), however they were computed. */
export function assembleRanking(region: Region, landing: number, stats: Record<Body, BodyStats[]>): RankingDoc {
  checkLandingTime(landing);
  const ranking = rankSites(stats.sun, stats.earth);
  const top = new Set(selectTop(ranking.order, region.xM, region.yM, TOP_N, TOP_SEPARATION_M));
  const sites = ranking.order.map((i, r): RankingEntry => ({
    site_id: region.siteIds[i],
    rank: r + 1,
    coverage: toCoverage(ranking.fullCoverage[i]),
    worst_case_min_clearance_deg: roundTo(ranking.worstCaseMinClearanceDeg[i]),
    top: top.has(i),
    sun: statsDoc(stats.sun[i], landing),
    earth: statsDoc(stats.earth[i], landing),
  }));
  return {
    ...stayHeader(region, landing), observer_height_m: region.observerHeightM,
    top_n: TOP_N, top_separation_m: TOP_SEPARATION_M, sites,
  };
}

export interface SeriesDoc {
  azimuth_deg: number[];
  elevation_deg: number[];
  horizon_elevation_deg: number[];
}

export interface SiteDetailDoc extends StayHeader {
  site_id: string;
  coverage: Coverage;
  worst_case_min_clearance_deg: number;
  horizon: { azimuth_start_deg: number; azimuth_step_deg: number; elevation_deg: number[] };
  series: { time_utc: string[]; sun: SeriesDoc; earth: SeriesDoc };
  stats: { sun: StatsDoc; earth: StatsDoc };
}

/** The site detail document (§7.2); `entry` is this site's entry in the ranking for the same stay. */
export function computeSiteDetail(region: Region, positions: Positions, landing: number, siteId: string, entry: RankingEntry): SiteDetailDoc {
  checkStay(positions, landing);
  const i = siteIndexOf(region, siteId);
  const series = (b: Body): SeriesDoc => {
    const t = track(region, i, positions, b);
    const r = (a: Float64Array) => Array.from(a, (v) => roundTo(v));
    return { azimuth_deg: r(t.azimuthDeg), elevation_deg: r(t.elevationDeg), horizon_elevation_deg: r(t.horizonElevationDeg) };
  };
  const h = region.horizons;
  const horizon = Array.from(h.values.subarray(i * h.nAzimuths, (i + 1) * h.nAzimuths), (v) => roundTo(v * h.scale, 2));
  return {
    ...stayHeader(region, landing), site_id: siteId, coverage: entry.coverage,
    worst_case_min_clearance_deg: entry.worst_case_min_clearance_deg,
    horizon: { azimuth_start_deg: 0, azimuth_step_deg: region.azimuthStepDeg, elevation_deg: horizon },
    series: {
      time_utc: Array.from({ length: N_SAMPLES }, (_, k) => formatUtc(landing + k * STEP_MS)),
      sun: series("sun"), earth: series("earth"),
    },
    stats: { sun: entry.sun, earth: entry.earth },
  };
}

export interface LandingWindowsDoc {
  schema_version: number;
  mock: boolean;
  region_id: string;
  site_id: string;
  search_start_utc: string;
  search_end_utc: string;
  step_s: number;
  merge_gap_h: number;
  top_n: number;
  strip: { runs: { start_utc: string; end_utc: string; coverage: Coverage }[] };
  windows: {
    rank: number;
    start_utc: string;
    end_utc: string;
    duration_h: number;
    contains_partial_gaps: boolean;
    best_landing_time_utc: string;
    best_worst_case_min_clearance_deg: number;
  }[];
}

/** Positions for every Surface Stay of the Supported Span (all Landing Times + one stay). */
export function loadSpanPositions(read: ReadBytes, cache?: PositionsCache): Promise<Positions> {
  return loadPositions(read, SPAN_START, N_LANDING_TIMES + STAY_STEPS, cache);
}

/** The Landing Windows document (§7.3) for one site; `span` comes from loadSpanPositions. */
export function computeLandingWindows(region: Region, span: Positions, siteId: string): LandingWindowsDoc {
  if (span.start !== SPAN_START || span.n !== N_LANDING_TIMES + STAY_STEPS) throw new Error("positions must cover the Supported Span");
  const i = siteIndexOf(region, siteId);
  const sun = clearance(track(region, i, span, "sun"));
  const earth = clearance(track(region, i, span, "earth"));
  const worst = sun.map((s, k) => Math.min(s, earth[k]));
  const found = landingWindows(worst, N_SAMPLES, Math.round((MERGE_GAP_H * 3600) / STEP_S), TOP_N);
  const at = (j: number) => formatUtc(SPAN_START + j * STEP_MS);
  return {
    schema_version: SCHEMA_VERSION, mock: false, region_id: region.regionId, site_id: siteId,
    search_start_utc: formatUtc(SPAN_START), search_end_utc: formatUtc(SPAN_END),
    step_s: STEP_S, merge_gap_h: MERGE_GAP_H, top_n: TOP_N,
    strip: { runs: found.runs.map((r) => ({ start_utc: at(r.start), end_utc: at(r.end), coverage: toCoverage(r.full) })) },
    windows: found.windows.map((w, r) => ({
      rank: r + 1, start_utc: at(w.start), end_utc: at(w.end),
      duration_h: roundTo(((w.end - w.start) * STEP_S) / 3600, 2),
      contains_partial_gaps: w.containsPartialGaps, best_landing_time_utc: at(w.best),
      best_worst_case_min_clearance_deg: roundTo(w.bestWorstCaseMinClearanceDeg),
    })),
  };
}
