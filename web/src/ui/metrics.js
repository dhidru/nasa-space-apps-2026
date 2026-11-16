// SPDX-License-Identifier: MIT
// Site metrics over a window of time: terrain-aware Sun and Earth visibility, darkness spells and slope.
import { D } from "./ephemeris.js";

const R_MOON = 1737400;
const RELIEF_MAX = 11000;

/**
 * Fraction (0..1) of a disc of angular radius `half` in direction `dir` that is above the local
 * terrain horizon at (lat, lon) in radians. Marches toward the disc over the global elevation grid,
 * allowing for the Moon's curvature.
 */
export function visibility(data, lat, lon, dir, half) {
  const sl = Math.sin(lat), cl = Math.cos(lat), co = Math.cos(lon), so = Math.sin(lon);
  const su = cl * co * dir[0] + cl * so * dir[1] + sl * dir[2];
  if (su < -0.05) return 0;
  const se = -so * dir[0] + co * dir[1];
  const sn = -sl * co * dir[0] - sl * so * dir[1] + cl * dir[2];
  const hl = Math.hypot(se, sn) || 1e-9, tanEl = su / hl, de = se / hl, dn = sn / hl;
  let v = clamp01(0.5 + Math.atan(tanEl) / (2 * half)); // against a flat horizon
  if (v <= 0) return 0;
  const g = data.grid, h0 = data.gridHeight(lon, lat), fine = data.fineAt && data.fineAt(lon, lat);
  const pxN = (Math.PI * R_MOON) / g.h, pxE = Math.max((2 * Math.PI * R_MOON * cl) / g.w, 50);
  let step = fine ? 100 : Math.min(pxE, pxN) * 0.9, dist = step;
  const grow = fine ? 1.1 : 1.07;
  for (let k = 0; k < 90; k++) {
    const need = dist * tanEl + (dist * dist) / (2 * R_MOON);
    if (need > RELIEF_MAX - h0 || dist > 500000) break;
    const latS = lat + (dn * dist) / R_MOON;
    if (latS > Math.PI / 2 || latS < -Math.PI / 2) break;
    const lonS = lon + (de * dist) / (R_MOON * Math.max(cl, 0.02));
    const lit = 0.5 - (data.gridHeight(lonS, latS) - h0 - need) / (dist * half * 2);
    if (lit < v) { v = lit; if (v <= 0) return 0; }
    step *= grow; dist += step;
  }
  return clamp01(v);
}

/** Fraction (0..1) of a disc of angular radius `halfDeg` at elevation `elDeg` above a Horizon at `hzDeg`. */
export const discAbove = (elDeg, hzDeg, halfDeg) => clamp01(0.5 + (elDeg - hzDeg) / (2 * halfDeg));

/** Percent of time in sunlight / with Earth in view, and the longest continuous darkness (hours). */
export function summarize(series, stepHours) {
  let sun = 0, earth = 0, run = 0, longest = 0;
  for (const p of series) {
    if (p.sunVis >= 0.5) { sun++; run = 0; } else { run++; longest = Math.max(longest, run); }
    if (p.earthVis >= 0.5) earth++;
  }
  return {
    sunPct: (100 * sun) / series.length,
    earthPct: (100 * earth) / series.length,
    longestDarkH: longest * stepHours,
  };
}

/** Terrain slope in degrees, over a site cell where 80 m region terrain is loaded, else over ~2.7 km. */
export async function slopeDeg(data, latDeg, lonDeg) {
  const lat = latDeg * D, lon = lonDeg * D;
  // Over one 200 m site cell where an 80 m region DEM is loaded, else over one coarse terrain sample (~2.7 km).
  const d = data.fineAt && data.fineAt(lon, lat) ? 100 : (Math.PI * R_MOON) / 2 ** data.terrainMax / (data.S - 1);
  const dLat = d / R_MOON, dLon = d / (R_MOON * Math.max(Math.cos(lat), 1e-3));
  const h = await data.sampleLattice([lon - dLon, lon, lon + dLon], [lat + dLat, lat, lat - dLat], data.terrainMax);
  const gx = (h[5] - h[3]) / (2 * d), gy = (h[1] - h[7]) / (2 * d);
  return Math.atan(Math.hypot(gx, gy)) / D;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
