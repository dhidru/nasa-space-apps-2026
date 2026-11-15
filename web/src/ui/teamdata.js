// SPDX-License-Identifier: MIT
// The UI's data layer, on the science code (src/science, Apache-2.0):
//   - files are served by the siteData build plugin under <base>/data/ (results/ left out, ADR 0001)
//     and read with fetchSiteData / readJson;
//   - sites and Horizons are loaded and decoded by loadRegion (data-contract §5.3, §6.1);
//   - Sun/Earth positions by loadPositions (§6.2);
//   - where the Sun and Earth appear from a site, and the Horizon under them, by track() (design.md §5).
// So the 3D view, the readouts and the rankings all use the same files and the same code.

import { dataRootFromPage, fetchSiteData } from "../science/fetchSiteData.ts";
import { loadRegion, loadPositions, readJson } from "../science/data.ts";
import { track } from "../science/geometry.ts";
import { STEP_MS } from "../science/time.ts";

/** Absolute URL of the published data/ folder (the science worker reads the same one). */
export const DATA_ROOT = dataRootFromPage();
const read = fetchSiteData(DATA_ROOT);
const url = (path) => new URL(path, DATA_ROOT).href;

/** The nine regions, from regions.json and each outline (map x/y in metres, closing vertex dropped). */
export async function loadRegions() {
  const reg = await readJson(read, "regions.json");
  return Promise.all(reg.regions.map(async (r) => {
    const outline = await readJson(read, r.outline);
    const ring = outline.features[0].geometry.coordinates[0].map(([x, y]) => [x, y]);
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (ring.length > 1 && a[0] === b[0] && a[1] === b[1]) ring.pop();
    return {
      id: r.id, name: r.display_name, lat: r.center.lat_deg, lon: r.center.lon_deg, xy: ring,
      hasSiteData: !!r.has_site_data, basemap: r.basemap,
    };
  }));
}

/** regions.json's source line, for attribution. */
export const loadRegionsSource = () => readJson(read, "regions.json").then((r) => r.source);

export const loadHomeBasemap = () => readJson(read, "home/basemap.json").then((m) => ({ ...m, href: url(`home/${m.image}`) }));

export function loadRegionBasemap(region) {
  return readJson(read, region.basemap).then((m) => ({ ...m, href: url(region.basemap.replace(/[^/]+$/, m.image)) }));
}

/**
 * A region's sites and Horizons, via loadRegion. Adds heightOf(siteId): terrain height (m), and
 * robustnessOf(siteId): Timing Robustness (0–1, data-contract §5.3), undefined if the pipeline didn't compute it.
 * `region.siteIndex` maps site ids to rows; Horizons are decoded once.
 */
export async function loadTeamRegion(regionId) {
  const region = await loadRegion(read, regionId);
  return {
    region,
    heightOf(siteId) {
      const i = region.siteIndex.get(siteId);
      return i === undefined ? undefined : region.observerAboveSphereM[i] - region.observerHeightM;
    },
    robustnessOf(siteId) {
      const i = region.siteIndex.get(siteId);
      return i === undefined || !region.timingRobustness ? undefined : region.timingRobustness[i];
    },
  };
}

/**
 * Sun and Earth seen from one site of a loaded region, for any number of instants, using track():
 * azimuth, elevation (from the observer, 2 m above the terrain) and the Horizon Elevation under each body.
 * `vectors` is a list of { sunKm, earthKm } (MOON_ME, from the Moon's centre).
 */
export function siteTracks(teamRegion, siteId, vectors) {
  const { region } = teamRegion, site = region.siteIndex.get(siteId), n = vectors.length;
  if (site === undefined) return null;
  const sun = new Float64Array(n * 3), earth = new Float64Array(n * 3);
  vectors.forEach((v, k) => { for (let c = 0; c < 3; c++) { sun[k * 3 + c] = v.sunKm[c]; earth[k * 3 + c] = v.earthKm[c]; } });
  const positions = { start: 0, n, sun, earth };
  return { sun: track(region, site, positions, "sun"), earth: track(region, site, positions, "earth") };
}

/**
 * Sun/Earth positions for every 10-minute step of the UTC years 2026 and 2027, loaded with
 * loadPositions. at(date) -> { sunKm, earthKm } (linear between steps) or null outside those years.
 */
export async function loadAllPositions() {
  const start = Date.UTC(2026, 0, 1), end = Date.UTC(2028, 0, 1), n = (end - start) / STEP_MS;
  const p = await loadPositions(read, start, n);
  return {
    at(date) {
      const u = (date.getTime() - start) / STEP_MS;
      if (!(u >= 0 && u <= n - 1)) return null;
      const i = Math.min(n - 2, Math.floor(u)), a = u - i;
      const lerp = (v) => [0, 1, 2].map((c) => v[i * 3 + c] * (1 - a) + v[(i + 1) * 3 + c] * a);
      return { sunKm: lerp(p.sun), earthKm: lerp(p.earth) };
    },
  };
}
