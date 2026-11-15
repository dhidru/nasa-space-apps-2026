/**
 * Metrics, ranking and Landing Windows (design.md §5-6, data-contract §7), in index space.
 * Line of Sight means Clearance > 0, judged at the body's center (GLOSSARY.md).
 */

export interface BodyStats {
  minElevationDeg: number;
  meanElevationDeg: number;
  maxElevationDeg: number;
  minClearanceDeg: number;
  meanClearanceDeg: number;
  maxClearanceDeg: number;
  losFraction: number;
  losDurationH: number;
  /** First sample without Line of Sight, or -1 if there is none. */
  firstLosLossIndex: number;
}

export function bodyStats(elevationDeg: ArrayLike<number>, clearanceDeg: ArrayLike<number>, stepS: number): BodyStats {
  const n = elevationDeg.length;
  let minE = Infinity, maxE = -Infinity, sumE = 0;
  let minC = Infinity, maxC = -Infinity, sumC = 0;
  let los = 0, firstLoss = -1;
  for (let k = 0; k < n; k++) {
    const e = elevationDeg[k], c = clearanceDeg[k];
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    sumE += e;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    sumC += c;
    if (c > 0) los++;
    else if (firstLoss < 0) firstLoss = k;
  }
  return {
    minElevationDeg: minE, meanElevationDeg: sumE / n, maxElevationDeg: maxE,
    minClearanceDeg: minC, meanClearanceDeg: sumC / n, maxClearanceDeg: maxC,
    losFraction: los / n, losDurationH: (los * stepS) / 3600, firstLosLossIndex: firstLoss,
  };
}

export interface Ranking {
  order: number[]; // site indices, best first
  fullCoverage: boolean[]; // per site
  worstCaseMinClearanceDeg: number[]; // min(Sun min, Earth min Clearance) per site
}

/**
 * Full Coverage first, by worst-case min Clearance then by the mean of the two mean Clearances;
 * then Partial Coverage, by the weaker body's fraction in Line of Sight. Ties keep site order.
 */
export function rankSites(sun: BodyStats[], earth: BodyStats[]): Ranking {
  const n = sun.length;
  const full = sun.map((s, i) => s.losFraction === 1 && earth[i].losFraction === 1);
  const worst = sun.map((s, i) => Math.min(s.minClearanceDeg, earth[i].minClearanceDeg));
  // Full: worst-case min Clearance. Partial: the weaker body's fraction in Line of Sight.
  const primary = sun.map((s, i) => (full[i] ? worst[i] : Math.min(s.losFraction, earth[i].losFraction)));
  // Full only: the mean of the two mean Clearances.
  const meanClearance = sun.map((s, i) => (full[i] ? (s.meanClearanceDeg + earth[i].meanClearanceDeg) / 2 : 0));
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => Number(full[b]) - Number(full[a]) || primary[b] - primary[a] || meanClearance[b] - meanClearance[a] || a - b);
  return { order, fullCoverage: full, worstCaseMinClearanceDeg: worst };
}

/** Greedy top-n: walk the ranking, keep a site unless it lies closer than separationM to one already kept. */
export function selectTop(order: number[], xM: ArrayLike<number>, yM: ArrayLike<number>, n: number, separationM: number): number[] {
  const chosen: number[] = [];
  for (const i of order) {
    if (chosen.length === n) break;
    if (chosen.every((j) => Math.hypot(xM[i] - xM[j], yM[i] - yM[j]) >= separationM)) chosen.push(i);
  }
  return chosen;
}

export interface LandingWindow {
  start: number; // first Landing Time index
  end: number; // exclusive
  containsPartialGaps: boolean;
  best: number; // Landing Time index with the highest worst-case min Clearance
  bestWorstCaseMinClearanceDeg: number;
}

export interface LandingWindows {
  runs: { start: number; end: number; full: boolean }[];
  windows: LandingWindow[]; // best first
}

/**
 * worstClearanceDeg[k] is min(Sun, Earth Clearance) at sample k from the first Landing Time searched
 * (n_landing + staySamples − 1 entries). Landing Time j has Full Coverage when every sample of
 * [j, j + staySamples) has Clearance > 0. Full runs closer than mergeGapSteps are merged, and windows
 * are ranked by the best worst-case min Clearance among their Full Coverage Landing Times.
 */
export function landingWindows(worstClearanceDeg: ArrayLike<number>, staySamples: number, mergeGapSteps: number, topN: number): LandingWindows {
  const len = worstClearanceDeg.length;
  const n = len - staySamples + 1;
  // Sliding-window minimum with a monotonic deque.
  const stayMin = new Float64Array(n);
  const dq = new Int32Array(len);
  let head = 0, tail = 0;
  for (let k = 0; k < len; k++) {
    while (tail > head && worstClearanceDeg[dq[tail - 1]] >= worstClearanceDeg[k]) tail--;
    dq[tail++] = k;
    if (dq[head] <= k - staySamples) head++;
    const j = k - staySamples + 1;
    if (j >= 0) stayMin[j] = worstClearanceDeg[dq[head]];
  }
  const runs: LandingWindows["runs"] = [];
  for (let j = 0; j < n; j++) {
    const full = stayMin[j] > 0;
    const last = runs[runs.length - 1];
    if (last && last.full === full) last.end = j + 1;
    else runs.push({ start: j, end: j + 1, full });
  }
  const merged: { start: number; end: number; gaps: boolean }[] = [];
  for (const r of runs) {
    if (!r.full) continue;
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < mergeGapSteps) {
      last.end = r.end;
      last.gaps = true;
    } else merged.push({ start: r.start, end: r.end, gaps: false });
  }
  const windows: LandingWindow[] = merged.map(({ start, end, gaps }) => {
    let best = -1;
    for (let j = start; j < end; j++) if (stayMin[j] > 0 && (best < 0 || stayMin[j] > stayMin[best])) best = j;
    return { start, end, containsPartialGaps: gaps, best, bestWorstCaseMinClearanceDeg: stayMin[best] };
  });
  windows.sort((a, b) => b.bestWorstCaseMinClearanceDeg - a.bestWorstCaseMinClearanceDeg);
  return { runs, windows: windows.slice(0, topN) };
}
