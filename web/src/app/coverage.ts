/** How coverage is labeled and colored everywhere in the UI (design.md §6). */
import type { RankingEntry } from "../science/results";

/** Rounded down, so a Partial body at 99.9 % never reads "100 %". */
export function pct(fraction: number): string {
  return `${Math.floor(fraction * 100 + 1e-9)} %`;
}

/** Tooltip wherever Timing Robustness is shown (GLOSSARY.md). */
export const ROBUSTNESS_TITLE =
  "Timing Robustness: the share of Landing Times in the Supported Span (one year) whose Surface Stay has Full Coverage";

/** Timing Robustness as a percentage, rounded down; "< 1 %" rather than "0 %" for a rare site, "—" if not computed. */
export function robustnessLabel(fraction: number | undefined): string {
  if (fraction === undefined) return "—";
  return fraction > 0 && fraction < 0.01 ? "< 1 %" : pct(fraction);
}

/** "Full coverage" or "Partial (Sun x %, Earth y %)". */
export function coverageLabel(e: RankingEntry): string {
  return e.coverage === "full" ? "Full coverage" : `Partial (Sun ${pct(e.sun.los_fraction)}, Earth ${pct(e.earth.los_fraction)})`;
}

// Color ramps, shared with the map legend.
export const FULL_LOW = [150, 230, 120], FULL_HIGH = [20, 120, 40];
export const PARTIAL_LOW = [120, 20, 30], PARTIAL_HIGH = [245, 170, 40];
export const rgb = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(Math.max(t, 0), 1)));
  return rgb(c);
}

/** Full: green, darker with more worst-case Clearance (0–5°). Partial: red (0 %) to amber (100 %) by the weaker body. */
export function coverageColor(e: RankingEntry): string {
  if (e.coverage === "full") return mix(FULL_LOW, FULL_HIGH, e.worst_case_min_clearance_deg / 5);
  return mix(PARTIAL_LOW, PARTIAL_HIGH, Math.min(e.sun.los_fraction, e.earth.los_fraction));
}

export const SUN_COLOR = "#f5c518";
export const EARTH_COLOR = "#4ea3ff";
export const LOS_COLOR = "rgba(60, 200, 90, 0.45)";
export const BLOCKED_COLOR = "rgba(230, 60, 60, 0.45)";
