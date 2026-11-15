// SPDX-License-Identifier: MIT
// Loads the tiles written by scripts/prepare-data.mjs and samples elevation across tile edges.
import { llToXY } from "./polar.js";

const TWO_PI = Math.PI * 2;

class LRU {
  constructor(limit) { this.limit = limit; this.map = new Map(); }
  get(k) { const v = this.map.get(k); if (v !== undefined) { this.map.delete(k); this.map.set(k, v); } return v; }
  set(k, v) {
    this.map.set(k, v);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
  }
}

async function fetchPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { bmp, img };
}

function decodeRG16(img, offset) {
  const n = img.width * img.height, out = new Float32Array(n), d = img.data;
  for (let i = 0; i < n; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] - offset;
  return out;
}

export class MoonData {
  static async load(base = "/tiles") {
    const res = await fetch(`${base}/meta.json`);
    if (!res.ok) throw new Error(`Missing ${base}/meta.json. Run "npm run data" to build the NASA tiles.`);
    const d = new MoonData(base, await res.json());
    const { img } = await fetchPixels(`${base}/${d.meta.shadowGrid.file}`);
    d.grid = { w: img.width, h: img.height, data: decodeRG16(img, d.meta.shadowGrid.offset) };
    return d;
  }

  constructor(base, meta) {
    this.base = base;
    this.meta = meta;
    this.S = meta.terrain.size;
    this.terrainMax = meta.terrain.maxLevel;
    this.colorMax = meta.color.maxLevel;
    this.terrainCache = new LRU(1500);
    this.dems = []; // 80 m region DEMs (src/polar.js), blended over the coarse global terrain
    this.colorCache = new LRU(400);
  }

  addDem(dem) {
    if (!this.dems.some((d) => d.id === dem.id)) this.dems.push(dem);
  }

  /** Blend 80 m region DEMs over a coarse height at (lonRad, latRad). */
  refine(lon, lat, coarse) {
    if (!this.dems.length || lat > -1.39) return coarse; // all DEMs lie south of ~80 deg S
    const [x, y] = llToXY((lat * 180) / Math.PI, (lon * 180) / Math.PI);
    for (const d of this.dems) {
      const w = d.weight(x, y);
      if (w > 0) return w * d.at(x, y) + (1 - w) * coarse;
    }
    return coarse;
  }

  /** True where an 80 m region DEM covers (lonRad, latRad). */
  fineAt(lon, lat) {
    if (!this.dems.length || lat > -1.39) return false;
    const [x, y] = llToXY((lat * 180) / Math.PI, (lon * 180) / Math.PI);
    return this.dems.some((d) => d.weight(x, y) > 0);
  }

  terrainTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let p = this.terrainCache.get(key);
    if (!p) {
      p = fetchPixels(`${this.base}/terrain/${key}.png`).then(({ img }) => decodeRG16(img, this.meta.terrain.offset));
      p.catch(() => this.terrainCache.map.delete(key));
      this.terrainCache.set(key, p);
    }
    return p;
  }

  colorBitmap(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let p = this.colorCache.get(key);
    if (!p) {
      p = fetchPixels(`${this.base}/color/${key}.png`).then(({ bmp }) => bmp);
      p.catch(() => this.colorCache.map.delete(key));
      this.colorCache.set(key, p);
    }
    return p;
  }

  /**
   * Sample elevation on a lon/lat lattice using terrain tiles at `level`, crossing tile edges.
   * lons/lats are arrays in radians. Returns Float32Array(lats.length * lons.length), row-major (north first).
   */
  async sampleLattice(lons, lats, level) {
    const T = Math.min(level, this.terrainMax), nx = 2 ** (T + 1), ny = 2 ** T, seg = this.S - 1;
    const tileOf = (lon, lat) => {
      let u = ((lon + Math.PI) / TWO_PI) * nx; u = ((u % nx) + nx) % nx;
      let v = ((Math.PI / 2 - lat) / Math.PI) * ny; v = Math.min(ny - 1e-9, Math.max(0, v));
      return [u, v];
    };
    const needed = new Map();
    for (const lat of lats) for (const lon of lons) {
      const [u, v] = tileOf(lon, lat), tx = Math.floor(u), ty = Math.floor(v), k = `${tx},${ty}`;
      if (!needed.has(k)) needed.set(k, this.terrainTile(T, tx, ty));
    }
    const tiles = new Map();
    await Promise.all([...needed].map(async ([k, p]) => tiles.set(k, await p)));

    const out = new Float32Array(lats.length * lons.length), S = this.S;
    let o = 0;
    for (const lat of lats) for (const lon of lons) {
      const [u, v] = tileOf(lon, lat), tx = Math.floor(u), ty = Math.floor(v);
      const t = tiles.get(`${tx},${ty}`);
      const px = (u - tx) * seg, py = (v - ty) * seg;
      const x0 = Math.min(seg - 1, Math.floor(px)), y0 = Math.min(seg - 1, Math.floor(py)), fx = px - x0, fy = py - y0;
      const i = y0 * S + x0;
      const coarse = (t[i] * (1 - fx) + t[i + 1] * fx) * (1 - fy) + (t[i + S] * (1 - fx) + t[i + S + 1] * fx) * fy;
      out[o++] = this.dems.length ? this.refine(lon, lat, coarse) : coarse;
    }
    return out;
  }

  gridHeight(lon, lat) {
    const g = this.grid;
    let x = ((lon + Math.PI) / TWO_PI) * g.w - 0.5;
    let y = ((Math.PI / 2 - lat) / Math.PI) * g.h - 0.5;
    y = Math.min(g.h - 1.001, Math.max(0, y));
    x = ((x % g.w) + g.w) % g.w;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % g.w, d = g.data;
    const a = d[y0 * g.w + x0], b = d[y0 * g.w + x1], c = d[(y0 + 1) * g.w + x0], e = d[(y0 + 1) * g.w + x1];
    const coarse = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
    return this.dems.length ? this.refine(lon, lat, coarse) : coarse;
  }
}
