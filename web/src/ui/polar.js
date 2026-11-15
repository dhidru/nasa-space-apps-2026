// SPDX-License-Identifier: MIT
// South polar stereographic map helpers (1,737,400 m sphere, true scale at the pole), region DEMs and the
// Landing Site grid from the team design (dhidru/nasa-space-apps-2026, docs/design.md §4, src/pipeline/sites.py):
// site centres on a global 200 m lattice at odd multiples of 100 m; row 0 is the top (largest y) row inside
// the region, ids are r<row>c<col> counted from the region's top-left site.

export const R_MOON = 1737400;
export const GRID_M = 200;
const HALF = GRID_M / 2;

export function llToXY(latDeg, lonDeg) {
  const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180;
  const rho = 2 * R_MOON * Math.tan(Math.PI / 4 + lat / 2);
  return [rho * Math.sin(lon), rho * Math.cos(lon)];
}
export function xyToLL(x, y) {
  const rho = Math.hypot(x, y);
  return [-90 + (2 * Math.atan(rho / (2 * R_MOON)) * 180) / Math.PI, (Math.atan2(x, y) * 180) / Math.PI];
}

export function bbox(xy) {
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

/** Even-odd point-in-polygon test, as the pipeline's points_in_polygon (src/pipeline/sites.py). `ring` is open. */
function insideRing(x, y, ring) {
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
  }
  return inside;
}

/** A lattice: the occupied cells as "m,k" (k = floor(x / 200), m = floor(y / 200)) and the k/m of column 0 and row 0. */
function lattice(cells, k0, m0) {
  let k1 = -Infinity, m1 = Infinity;
  for (const key of cells) { const [m, k] = key.split(",").map(Number); k1 = Math.max(k1, k); m1 = Math.min(m1, m); }
  return { cells, k0, m0, k1, m1, cols: k1 - k0 + 1, rows: m0 - m1 + 1 };
}

/** Lattice from the outline, by the pipeline's rule (build_site_grid): 200 m centres inside it, ids from the first
 * occupied row and column. Used until the region's sites.json is in. */
function outlineLattice(region) {
  const b = bbox(region.xy);
  const kA = Math.ceil((b.xmin - HALF) / GRID_M), kB = Math.floor((b.xmax - HALF) / GRID_M);
  const mA = Math.floor((b.ymax - HALF) / GRID_M), mB = Math.ceil((b.ymin - HALF) / GRID_M);
  const cells = new Set();
  let k0 = Infinity, m0 = -Infinity;
  for (let m = mA; m >= mB; m--) for (let k = kA; k <= kB; k++) {
    if (!insideRing(HALF + k * GRID_M, HALF + m * GRID_M, region.xy)) continue;
    cells.add(`${m},${k}`);
    k0 = Math.min(k0, k); m0 = Math.max(m0, m);
  }
  return lattice(cells, k0, m0);
}

// Lattices read from sites.json, by region id. The published sites don't always follow the outline rule at the edges
// (Haworth's start one column in from its west edge), so once they are loaded they are the truth.
const fromSites = new Map();

/** Use the sites the pipeline published (ids and map x/y in metres, in matching order) as `regionId`'s lattice. */
export function setSiteLattice(regionId, ids, xs, ys) {
  if (!ids?.length) return;
  const cells = new Set();
  let k0 = Infinity, m0 = -Infinity;
  ids.forEach((siteId, i) => {
    const id = /^r(\d+)c(\d+)$/.exec(siteId);
    if (!id) return;
    const k = Math.floor(xs[i] / GRID_M), m = Math.floor(ys[i] / GRID_M);
    cells.add(`${m},${k}`);
    k0 = Math.min(k0, k - +id[2]); m0 = Math.max(m0, m + +id[1]);
  });
  fromSites.set(regionId, lattice(cells, k0, m0));
}

/**
 * The region's Landing Site grid: 200 m cells centred at odd multiples of 100 m, ids r<row>c<col> from the top-left
 * site. Matches sites.json once setSiteLattice has run for the region (call refresh() on a grid made before that).
 */
export function siteGrid(region) {
  let L = fromSites.get(region.id) ?? outlineLattice(region);
  const grid = {
    get k0() { return L.k0; }, get k1() { return L.k1; }, get m0() { return L.m0; }, get m1() { return L.m1; },
    get cols() { return L.cols; }, get rows() { return L.rows; }, get count() { return L.cells.size; },
    /** Switch to the sites.json lattice if it has loaded since; true if the grid changed. */
    refresh() {
      const next = fromSites.get(region.id);
      if (!next || next === L) return false;
      L = next;
      return true;
    },
    /** Cell under map point (x, y), or null outside the region. */
    cellAt(x, y) {
      const k = Math.floor(x / GRID_M), m = Math.floor(y / GRID_M);
      return L.cells.has(`${m},${k}`) ? grid.cell(L.m0 - m, k - L.k0) : null;
    },
    cell(r, c) {
      if (r < 0 || c < 0 || !L.cells.has(`${L.m0 - r},${L.k0 + c}`)) return null;
      const x = HALF + (L.k0 + c) * GRID_M, y = HALF + (L.m0 - r) * GRID_M;
      const [lat, lon] = xyToLL(x, y);
      return { id: `r${String(r).padStart(3, "0")}c${String(c).padStart(3, "0")}`, r, c, x, y, lat, lon };
    },
    byId(id) {
      const m = /^r(\d+)c(\d+)$/.exec(id || "");
      return m ? grid.cell(+m[1], +m[2]) : null;
    },
    /** Bounding box of the site cells (for drawing: the grid lines and the dimmed surround). */
    get extent() {
      return { xmin: L.k0 * GRID_M, xmax: (L.k1 + 1) * GRID_M, ymin: L.m1 * GRID_M, ymax: (L.m0 + 1) * GRID_M };
    },
    /**
     * SVG paths in map metres (y flipped, as the region map draws): `border`, the outer edges of the site cells, and
     * `gaps`, the cells inside the bounding box with no site. The pipeline leaves a few edge cells out in some regions.
     */
    outlinePaths() {
      if (L.paths) return L.paths;
      const has = (m, k) => L.cells.has(`${m},${k}`);
      let border = "", gaps = "";
      for (let m = L.m1; m <= L.m0; m++) for (let k = L.k0; k <= L.k1; k++) {
        const x = k * GRID_M, y = -(m + 1) * GRID_M; // top-left corner on screen
        if (!has(m, k)) { gaps += `M${x},${y}h${GRID_M}v${GRID_M}h${-GRID_M}z`; continue; }
        if (!has(m + 1, k)) border += `M${x},${y}h${GRID_M}`;
        if (!has(m - 1, k)) border += `M${x},${y + GRID_M}h${GRID_M}`;
        if (!has(m, k - 1)) border += `M${x},${y}v${GRID_M}`;
        if (!has(m, k + 1)) border += `M${x + GRID_M},${y}v${GRID_M}`;
      }
      return (L.paths = { border, gaps });
    },
  };
  return grid;
}

/** A region DEM from tiles/polar (80 m LOLA), decoded to metres. */
export async function loadRegionDem(base, meta, id) {
  const info = meta.regions[id];
  const res = await fetch(`${base}/${info.dem}`);
  if (!res.ok) throw new Error(`${info.dem}: HTTP ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const H = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < H.length; i++) H[i] = d[i * 4] * 256 + d[i * 4 + 1] - meta.offset;
  return makeDem(id, info.x0_m, info.y0_m, info.pixel_m, bmp.width, bmp.height, H);
}

export function makeDem(id, x0, y0, px, w, h, H) {
  const xmin = x0, xmax = x0 + (w - 1) * px, ymax = y0, ymin = y0 - (h - 1) * px;
  return {
    id, x0, y0, px, w, h, H, xmin, xmax, ymin, ymax,
    /** Bilinear height (m) at map x/y, or NaN outside. */
    at(x, y) {
      const col = (x - x0) / px, row = (y0 - y) / px;
      if (col < 0 || row < 0 || col > w - 1 || row > h - 1) return NaN;
      const c0 = Math.min(w - 2, Math.floor(col)), r0 = Math.min(h - 2, Math.floor(row)), fc = col - c0, fr = row - r0, i = r0 * w + c0;
      return (H[i] * (1 - fc) + H[i + 1] * fc) * (1 - fr) + (H[i + w] * (1 - fc) + H[i + w + 1] * fc) * fr;
    },
    /** 0 at the DEM edge rising to 1 two km inside it, for blending into the coarse global terrain. */
    weight(x, y) {
      const d = Math.min(x - xmin, xmax - x, y - ymin, ymax - y);
      return d <= 0 ? 0 : d >= 2000 ? 1 : d / 2000;
    },
    /** Slope (deg) over one site cell (200 m) around map x/y. */
    slope(x, y) {
      const s = GRID_M / 2;
      const gx = (this.at(x + s, y) - this.at(x - s, y)) / (2 * s), gy = (this.at(x, y + s) - this.at(x, y - s)) / (2 * s);
      return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    },
  };
}
