// SPDX-License-Identifier: MIT
// Loads the team pipeline's output (data/processed/site-data, see docs/data-contract.md), which
// scripts/copy-site-data.mjs copies to public/site-data before every dev run and build.
//
//   regions.json + regions/<id>/outline.geojson   region registry and outlines (contract §5.1, §5.2)
//   home/basemap.*, regions/<id>/basemap.*        hillshades placed by extent_m (§5.5)
//   regions/<id>/sites.json                       site grid with terrain heights (§5.3)
//   regions/<id>/horizons.bin.gz                  Horizon Elevation per site, 0.25° azimuth steps (§6.1)
//   ephemeris/positions-<YYYY>.bin                Sun/Earth vectors from the Moon's centre, MOON_ME, km (§6.2)

export const SITE_DATA = `${import.meta.env.BASE_URL}site-data`;

async function getJson(path) {
  const res = await fetch(`${SITE_DATA}/${path}`);
  if (!res.ok) throw new Error(`site-data/${path}: HTTP ${res.status}`);
  return res.json();
}
async function getBytes(path) {
  const res = await fetch(`${SITE_DATA}/${path}`);
  if (!res.ok) throw new Error(`site-data/${path}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The nine regions, from regions.json and each outline (map x/y in metres, closing vertex dropped). */
export async function loadRegions() {
  const reg = await getJson("regions.json");
  return Promise.all(reg.regions.map(async (r) => {
    const outline = await getJson(r.outline);
    const ring = outline.features[0].geometry.coordinates[0].map(([x, y]) => [x, y]);
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (ring.length > 1 && a[0] === b[0] && a[1] === b[1]) ring.pop();
    return {
      id: r.id, name: r.display_name, lat: r.center.lat_deg, lon: r.center.lon_deg, xy: ring,
      hasSiteData: !!r.has_site_data, basemap: r.basemap,
    };
  }));
}

export const loadHomeBasemap = () => getJson("home/basemap.json").then((m) => ({ ...m, href: `${SITE_DATA}/home/${m.image}` }));

export function loadRegionBasemap(region) {
  const dir = region.basemap.slice(0, region.basemap.lastIndexOf("/") + 1);
  return getJson(region.basemap).then((m) => ({ ...m, href: `${SITE_DATA}/${dir}${m.image}` }));
}

/** sites.json as a Map site_id -> site, plus the ordered list (row order of the Horizons). */
export async function loadSites(regionId) {
  const doc = await getJson(`regions/${regionId}/sites.json`);
  const byId = new Map(doc.sites.map((s, i) => [s.site_id, { ...s, index: i }]));
  return { ...doc, byId };
}

async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes; // the host already removed Content-Encoding: gzip
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Horizons for a region: horizonAt(siteIndex, azDeg) -> Horizon Elevation in degrees (contract §6.1). */
export async function loadHorizons(regionId) {
  const meta = await getJson(`regions/${regionId}/horizons.json`);
  const raw = await gunzip(await getBytes(`regions/${regionId}/${meta.file}`));
  const [nSites, nAz] = meta.shape;
  const v = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  if (v.length !== nSites * nAz) throw new Error(`horizons: expected ${nSites * nAz} values, got ${v.length}`);
  const elev = new Float32Array(v.length);
  for (let s = 0; s < nSites; s++) {
    let acc = 0;
    for (let k = 0, o = s * nAz; k < nAz; k++, o++) { acc += v[o]; elev[o] = acc * meta.scale; } // undo delta_axis
  }
  const step = meta.azimuth_step_deg, start = meta.azimuth_start_deg;
  return {
    meta, nSites, nAz, elev,
    horizonAt(site, azDeg) {
      let u = ((((azDeg - start) % 360) + 360) % 360) / step;
      const k0 = Math.floor(u) % nAz, k1 = (k0 + 1) % nAz, f = u - Math.floor(u), o = site * nAz;
      return elev[o + k0] * (1 - f) + elev[o + k1] * f;
    },
  };
}

/** Sun/Earth positions for the given UTC years: at(date) -> { sunKm, earthKm } or null outside them. */
export async function loadPositions(years = [2026, 2027]) {
  const files = await Promise.all(years.map(async (y) => {
    const meta = await getJson(`ephemeris/positions-${y}.json`);
    const b = await getBytes(`ephemeris/${meta.file}`);
    return { meta, t0: Date.parse(meta.start_utc), step: meta.step_s * 1000, n: meta.shape[0], v: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) };
  }));
  const vec = (f, i, body) => { const o = (i * 2 + body) * 3; return [f.v[o], f.v[o + 1], f.v[o + 2]]; };
  return {
    files,
    at(date) {
      const t = date.getTime();
      const f = files.find((f) => t >= f.t0 && t <= f.t0 + (f.n - 1) * f.step);
      if (!f) return null;
      const u = (t - f.t0) / f.step, i = Math.min(f.n - 2, Math.floor(u)), a = u - i;
      const lerp = (body) => { const p = vec(f, i, body), q = vec(f, i + 1, body); return [0, 1, 2].map((k) => p[k] * (1 - a) + q[k] * a); };
      return { sunKm: lerp(0), earthKm: lerp(1) };
    },
  };
}
