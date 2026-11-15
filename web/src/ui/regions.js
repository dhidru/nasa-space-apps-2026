// SPDX-License-Identifier: MIT
// Region helpers. The nine Artemis III regions themselves (NASA release 24-136, 2024-10-28; USGS outlines,
// CC0, DOI 10.5066/P1MEQ6UK) come from the team pipeline's regions.json at run time: see src/teamdata.js.
// Outline corners are in the south polar stereographic map (1,737,400 m sphere, true scale at the pole),
// where each region's edges are straight lines.

const R = 1737400;

/** Polar stereographic metres -> [lat, lon] in degrees. */
export function xyToLatLon(x, y) {
  const rho = Math.hypot(x, y);
  return [-90 + (2 * Math.atan(rho / (2 * R)) * 180) / Math.PI, (Math.atan2(x, y) * 180) / Math.PI];
}

/** Closed outline as [lat, lon] points, with edges densified every `stepM` metres along the map's straight lines. */
export function outlineLatLon(region, stepM = 500) {
  const pts = [];
  const c = region.xy;
  for (let i = 0; i < c.length; i++) {
    const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % c.length];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stepM));
    for (let k = 0; k < n; k++) pts.push(xyToLatLon(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n));
  }
  pts.push(pts[0]);
  return pts;
}

/** Region size in km (width x height on the map). */
export function sizeKm(region) {
  const xs = region.xy.map((p) => p[0]), ys = region.xy.map((p) => p[1]);
  return [(Math.max(...xs) - Math.min(...xs)) / 1000, (Math.max(...ys) - Math.min(...ys)) / 1000];
}

/** Heights (m) at a list of [lonRad, latRad] points, from the 3D terrain tiles at `level`. */
export async function samplePoints(data, points, level) {
  const T = Math.min(level, data.terrainMax), nx = 2 ** (T + 1), ny = 2 ** T, S = data.S, seg = S - 1;
  const where = points.map(([lon, lat]) => {
    let u = ((lon + Math.PI) / (2 * Math.PI)) * nx; u = ((u % nx) + nx) % nx;
    const v = Math.min(ny - 1e-9, Math.max(0, ((Math.PI / 2 - lat) / Math.PI) * ny));
    return [u, v];
  });
  const keys = [...new Set(where.map(([u, v]) => `${Math.floor(u)},${Math.floor(v)}`))];
  const tiles = new Map(await Promise.all(keys.map(async (k) => { const [x, y] = k.split(",").map(Number); return [k, await data.terrainTile(T, x, y)]; })));
  return where.map(([u, v], n) => {
    const tx = Math.floor(u), ty = Math.floor(v), t = tiles.get(`${tx},${ty}`);
    const px = (u - tx) * seg, py = (v - ty) * seg;
    const x0 = Math.min(seg - 1, Math.floor(px)), y0 = Math.min(seg - 1, Math.floor(py)), fx = px - x0, fy = py - y0, i = y0 * S + x0;
    const coarse = (t[i] * (1 - fx) + t[i + 1] * fx) * (1 - fy) + (t[i + S] * (1 - fx) + t[i + S + 1] * fx) * fy;
    return data.refine ? data.refine(points[n][0], points[n][1], coarse) : coarse;
  });
}
