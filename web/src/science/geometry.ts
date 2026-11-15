/** Where a body appears from a site (design.md §5, data-contract §2). */
import type { Positions, Region } from "./data";

export const R_M = 1_737_400;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export type Body = "sun" | "earth";
export const BODIES: Body[] = ["sun", "earth"];

/**
 * A body over time from one site: azimuth (clockwise from local north), elevation from the flat
 * local horizontal, and the Horizon Elevation at the body's azimuth (the terrain line under it).
 * Clearance = elevation − horizonElevation.
 */
export interface Track {
  azimuthDeg: Float64Array;
  elevationDeg: Float64Array;
  horizonElevationDeg: Float64Array;
}

/**
 * Samples [from, from + n) of `positions`, seen from `site`. The observer is observerAboveSphereM above
 * the sphere at the site's lat/lon. The local frame is east-north-up with up along the
 * Moon-center-to-site line; body vectors are MOON_ME km from the Moon's center.
 */
export function track(region: Region, site: number, positions: Positions, body: Body, from = 0, n = positions.n - from): Track {
  const lat = region.latDeg[site] * RAD;
  const lon = region.lonDeg[site] * RAD;
  const rKm = (R_M + region.observerAboveSphereM[site]) / 1000;
  const cl = Math.cos(lon), sl = Math.sin(lon), cp = Math.cos(lat), sp = Math.sin(lat);
  const ux = cp * cl, uy = cp * sl, uz = sp;
  const ex = -sl, ey = cl; // east has no z component
  const nx = -sp * cl, ny = -sp * sl, nz = cp;
  const v = positions[body];
  // Horizon Elevation at the body azimuth: linear interpolation between columns, wrapping at 360°
  // (data-contract §6.1). Inlined without % because this is the hot loop of every ranking.
  const { values, scale, nAzimuths } = region.horizons;
  const base = site * nAzimuths;
  const perDeg = nAzimuths / 360;
  const az = new Float64Array(n), el = new Float64Array(n), hz = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const j = (from + k) * 3;
    const bx = v[j], by = v[j + 1], bz = v[j + 2];
    // The site vector is rKm * up, which is orthogonal to east and north.
    const e = ex * bx + ey * by;
    const no = nx * bx + ny * by + nz * bz;
    const u = ux * bx + uy * by + uz * bz - rKm;
    // atan2 gives (−180°, 180°], so one step wraps it into [0°, 360°); "+ 0" turns −0 into 0.
    let a = Math.atan2(e, no) * DEG + 0;
    if (a < 0) a += 360;
    if (a >= 360) a -= 360;
    az[k] = a;
    el[k] = Math.atan2(u, Math.sqrt(e * e + no * no)) * DEG;
    const f = a * perDeg;
    const k0 = Math.floor(f);
    const w = f - k0;
    const k1 = k0 + 1 === nAzimuths ? 0 : k0 + 1;
    hz[k] = (1 - w) * (values[base + k0] * scale) + w * (values[base + k1] * scale);
  }
  return { azimuthDeg: az, elevationDeg: el, horizonElevationDeg: hz };
}

/** Clearance (degrees) at each sample: elevation − Horizon Elevation. Negative means blocked. */
export function clearance(t: Track): Float64Array {
  const el = t.elevationDeg, hz = t.horizonElevationDeg;
  const out = new Float64Array(el.length);
  for (let k = 0; k < el.length; k++) out[k] = el[k] - hz[k];
  return out;
}
