/** Loading a region's site data and the Sun/Earth positions (data-contract §5-6). */
import { decodeHorizons, type Horizons, type HorizonsSidecar } from "./horizons";
import { formatUtc, parseUtc, STEP_MS, STEP_S } from "./time";

/** Reads a file by its path under the site-data root, e.g. "regions/mons-mouton/sites.json". */
export type ReadBytes = (path: string) => Promise<Uint8Array>;

/** A region's site grid and Horizons; site arrays follow the order of sites.json. */
export interface Region {
  regionId: string;
  siteIds: string[];
  siteIndex: Map<string, number>;
  xM: Float64Array;
  yM: Float64Array;
  latDeg: Float64Array;
  lonDeg: Float64Array;
  /** Terrain height + Observer Height, meters above the 1,737.4 km sphere. */
  observerAboveSphereM: Float64Array;
  observerHeightM: number;
  gridSpacingM: number;
  horizons: Horizons;
  azimuthStepDeg: number;
}

export interface SiteRecord {
  site_id: string;
  x_m: number;
  y_m: number;
  lat_deg: number;
  lon_deg: number;
  terrain_height_m: number;
}

export interface SitesDoc {
  region_id: string;
  grid_spacing_m: number;
  observer_height_m: number;
  sites: SiteRecord[];
}

const decoder = new TextDecoder();

export async function readJson<T>(read: ReadBytes, path: string): Promise<T> {
  return JSON.parse(decoder.decode(await read(path))) as T;
}

export function makeRegion(doc: SitesDoc, horizons: Horizons): Region {
  const n = doc.sites.length;
  if (horizons.nSites !== n) throw new Error(`${doc.region_id}: ${horizons.nSites} Horizon rows but ${n} sites`);
  const col = (f: (s: SiteRecord) => number) => Float64Array.from(doc.sites, f);
  return {
    regionId: doc.region_id,
    siteIds: doc.sites.map((s) => s.site_id),
    siteIndex: new Map(doc.sites.map((s, i) => [s.site_id, i])),
    xM: col((s) => s.x_m),
    yM: col((s) => s.y_m),
    latDeg: col((s) => s.lat_deg),
    lonDeg: col((s) => s.lon_deg),
    observerAboveSphereM: col((s) => s.terrain_height_m + doc.observer_height_m),
    observerHeightM: doc.observer_height_m,
    gridSpacingM: doc.grid_spacing_m,
    horizons,
    azimuthStepDeg: 360 / horizons.nAzimuths,
  };
}

export async function loadRegion(read: ReadBytes, regionId: string): Promise<Region> {
  const dir = `regions/${regionId}/`;
  const [doc, sidecar] = await Promise.all([
    readJson<SitesDoc>(read, dir + "sites.json"),
    readJson<HorizonsSidecar & { file: string }>(read, dir + "horizons.json"),
  ]);
  return makeRegion(doc, await decodeHorizons(await read(dir + sidecar.file), sidecar));
}

/** Sun and Earth vectors (MOON_ME, km, from the Moon's center) at 600 s steps from `start`. */
export interface Positions {
  start: number;
  n: number;
  sun: Float64Array; // [n × 3]
  earth: Float64Array; // [n × 3]
}

interface YearFile {
  start: number;
  steps: number;
  scale: number;
  values: Float32Array; // [steps × 2 × 3]
}

/** Year files already fetched, keyed by year; pass the same Map to reuse them. */
export type PositionsCache = Map<number, Promise<YearFile>>;

interface PositionsSidecar {
  file: string;
  dtype: string;
  byte_order: string;
  shape: number[];
  scale: number;
  bodies: string[];
  start_utc: string;
  step_s: number;
}

async function loadYear(read: ReadBytes, year: number): Promise<YearFile> {
  const side = `ephemeris/positions-${year}.json`;
  let meta: PositionsSidecar;
  try {
    meta = await readJson<PositionsSidecar>(read, side);
  } catch {
    throw new Error(`no Sun/Earth positions for ${year} (${side} is missing)`);
  }
  if (meta.bodies.join() !== "sun,earth" || meta.step_s !== STEP_S || meta.dtype !== "float32" || meta.byte_order !== "little") {
    throw new Error(`${side}: unexpected bodies, step or dtype`);
  }
  const bytes = await read(`ephemeris/${meta.file}`);
  const steps = meta.shape[0];
  if (bytes.byteLength !== steps * 6 * 4) throw new Error(`${meta.file}: expected ${steps}×2×3 float32 values`);
  // Copy so the Float32Array is aligned whatever buffer `read` returned.
  const values = new Float32Array(bytes.slice().buffer);
  return { start: parseUtc(meta.start_utc), steps, scale: meta.scale, values };
}

/** Positions for `n` samples from `start` (on the 600 s grid); a range across New Year reads two files. */
export async function loadPositions(read: ReadBytes, start: number, n: number, cache: PositionsCache = new Map()): Promise<Positions> {
  const sun = new Float64Array(n * 3);
  const earth = new Float64Array(n * 3);
  let done = 0;
  while (done < n) {
    const t = start + done * STEP_MS;
    const year = new Date(t).getUTCFullYear();
    if (!cache.has(year)) cache.set(year, loadYear(read, year));
    const file = await cache.get(year)!;
    const offset = t - file.start;
    if (offset < 0 || offset % STEP_MS) throw new Error(`${formatUtc(t)} is not on the ${STEP_S} s grid of positions-${year}`);
    const i0 = offset / STEP_MS;
    const take = Math.min(n - done, file.steps - i0);
    if (take <= 0) throw new Error(`${formatUtc(t)} is past the end of positions-${year}`);
    for (let k = 0; k < take; k++) {
      for (let c = 0; c < 3; c++) {
        sun[(done + k) * 3 + c] = file.values[(i0 + k) * 6 + c] * file.scale;
        earth[(done + k) * 3 + c] = file.values[(i0 + k) * 6 + 3 + c] * file.scale;
      }
    }
    done += take;
  }
  return { start, n, sun, earth };
}
