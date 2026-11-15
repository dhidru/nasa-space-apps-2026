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

/** The region's site lattice. All nine USGS outlines are axis-aligned squares/rectangles on this map. */
export function siteGrid(region) {
  const b = bbox(region.xy);
  const k0 = Math.ceil((b.xmin - HALF) / GRID_M), k1 = Math.floor((b.xmax - HALF) / GRID_M);
  const m0 = Math.floor((b.ymax - HALF) / GRID_M), m1 = Math.ceil((b.ymin - HALF) / GRID_M);
  const cols = k1 - k0 + 1, rows = m0 - m1 + 1;
  return {
    k0, k1, m0, m1, cols, rows, count: cols * rows,
    /** Cell under map point (x, y), or null outside the region. */
    cellAt(x, y) {
      const k = Math.floor(x / GRID_M), m = Math.floor(y / GRID_M);
      if (k < k0 || k > k1 || m > m0 || m < m1) return null;
      return this.cell(m0 - m, k - k0);
    },
    cell(r, c) {
      if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
      const x = HALF + (k0 + c) * GRID_M, y = HALF + (m0 - r) * GRID_M;
      const [lat, lon] = xyToLL(x, y);
      return { id: `r${String(r).padStart(3, "0")}c${String(c).padStart(3, "0")}`, r, c, x, y, lat, lon };
    },
    byId(id) {
      const m = /^r(\d+)c(\d+)$/.exec(id || "");
      return m ? this.cell(+m[1], +m[2]) : null;
    },
    /** Outer edges of the lattice cells (for drawing). */
    extent: { xmin: k0 * GRID_M, xmax: (k1 + 1) * GRID_M, ymin: m1 * GRID_M, ymax: (m0 + 1) * GRID_M },
  };
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
