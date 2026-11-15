// SPDX-License-Identifier: MIT
//
// Downloads NASA's public-domain Moon maps (CGI Moon Kit, SVS #4720) and cuts them
// into the tiles the viewer loads from /tiles:
//
//   tiles/color/{z}/{x}/{y}.png    LROC WAC colour mosaic, 256 px tiles (only with --with-color: the viewer does
//                                  not draw it, and the CGI Moon Kit doesn't state a license for this ASU-derived map)
//   tiles/terrain/{z}/{x}/{y}.png  LOLA elevation, 65 x 65 samples per tile, levels 0..TERRAIN_LEVELS
//   tiles/shadow-grid.png          2048 x 1024 global elevation grid used for cast shadows
//   tiles/meta.json                levels, encodings and data credits
//
// Tiles follow Cesium's GeographicTilingScheme: level z has 2^(z+1) x 2^z tiles, y = 0 at the north.
// Elevation is metres above the 1737.4 km reference sphere, stored as (metres + 32768) in 16 bits:
// red = high byte, green = low byte.
//
// Usage:
//   npm run data                         download (if needed) and build tiles
//   npm run build                        runs this with --if-missing, then vite build
//   DEM_FILE=./ldem_16.tif COLOR_FILE=./lroc_color_poles_8k.tif npm run data   use local files
//
// Environment overrides: DEM_URL, COLOR_URL, DEM_FILE, COLOR_FILE,
//   COLOR_LEVELS (default 4 -> 8192 px wide), TERRAIN_LEVELS (default 5 -> 4096 samples wide),
//   COLOR_MODE = gray | rgb (default gray: the LROC mosaic is nearly neutral and gray tiles are 3x smaller)

import { createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { fromFile } from "geotiff";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "data-raw");
// Region outlines come from the team pipeline's output (data/processed/site-data, docs/data-contract.md §5).
const SITE_DATA = join(root, "..", "data", "processed", "site-data");
const ARTEMIS_REGIONS = JSON.parse(readFileSync(join(SITE_DATA, "regions.json"), "utf8")).regions.map((r) => ({
  id: r.id,
  xy: JSON.parse(readFileSync(join(SITE_DATA, r.outline), "utf8")).features[0].geometry.coordinates[0],
}));
const OUT = join(root, "public", "tiles");

const SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720";
// Command-line flags work on every OS (Windows shells don't support VAR=value prefixes):
//   npm run data -- --dem C:\Users\me\Downloads\ldem_16.tif --color C:\Users\me\Downloads\lroc_color_poles_8k.tif
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
if (arg("dem")) process.env.DEM_FILE = arg("dem");
if (arg("color")) process.env.COLOR_FILE = arg("color");
if (arg("lola80")) process.env.LOLA80_IMG = arg("lola80");
if (arg("lola80-label")) process.env.LOLA80_LBL = arg("lola80-label");
const LOLA_BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/";

const DEM_URL = process.env.DEM_URL || `${SVS}/ldem_16.tif`;
const COLOR_URL = process.env.COLOR_URL || `${SVS}/lroc_color_poles_8k.tif`;
const COLOR_LEVELS = int(process.env.COLOR_LEVELS, 4);
const TERRAIN_LEVELS = int(process.env.TERRAIN_LEVELS, 5);
const COLOR_MODE = (process.env.COLOR_MODE || "gray").toLowerCase() === "rgb" ? "rgb" : "gray";
const TERRAIN_SIZE = 65;
const COLOR_TILE = 256;
const SHADOW_W = 2048, SHADOW_H = 1024;
const OFFSET = 32768;

function int(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }
const log = (...a) => console.log("[data]", ...a);

const POLAR = join(OUT, "polar");
const haveGlobal = existsSync(join(OUT, "meta.json")), havePolar = existsSync(join(POLAR, "meta.json"));
if (process.argv.includes("--if-missing") && haveGlobal && havePolar) {
  log("public/tiles/meta.json and polar/meta.json exist; skipping (run `npm run data` to rebuild).");
  process.exit(0);
}
const onlyPolar = process.argv.includes("--if-missing") && haveGlobal;

async function obtain(envFile, url) {
  if (envFile) {
    const p = resolve(envFile);
    if (!existsSync(p)) throw new Error(`File not found: ${p}`);
    return p;
  }
  mkdirSync(RAW, { recursive: true });
  const p = join(RAW, url.split("/").pop());
  if (existsSync(p) && statSync(p).size > 0) { log(`using cached ${p}`); return p; }
  log(`downloading ${url}`);
  let res;
  try { res = await fetch(url); } catch (e) { res = { ok: false, status: e.message }; }
  if (!res.ok) {
    throw new Error(
      `Download failed (${res.status}) for ${url}.\n` +
      `Download it by hand from https://svs.gsfc.nasa.gov/4720 and run again with ` +
      `DEM_FILE=... / COLOR_FILE=... pointing at the file.`
    );
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(p));
  log(`saved ${p} (${(statSync(p).size / 1e6).toFixed(1)} MB)`);
  return p;
}

// ---------- raster helpers (equirectangular, pixel centres, longitude wraps) ----------
function grid(w, h, data) { return { w, h, data }; }

function halve(g) {
  const w = g.w >> 1, h = g.h >> 1, out = new Float32Array(w * h), d = g.data, W = g.w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 2 * y * W + 2 * x;
    out[y * w + x] = (d[i] + d[i + 1] + d[i + W] + d[i + W + 1]) * 0.25;
  }
  return grid(w, h, out);
}
function pyramid(g, minW) {
  const levels = [g];
  while (levels[levels.length - 1].w / 2 >= minW && levels[levels.length - 1].w % 2 === 0) levels.push(halve(levels[levels.length - 1]));
  return levels;
}
// choose the coarsest pyramid level that still has at least `samplesAcross` pixels across the globe
function pick(levels, samplesAcross) {
  let best = levels[0];
  for (const l of levels) if (l.w >= samplesAcross) best = l;
  return best;
}
function sample(g, lonDeg, latDeg) {
  let x = ((lonDeg + 180) / 360) * g.w - 0.5;
  let y = ((90 - latDeg) / 180) * g.h - 0.5;
  y = Math.min(g.h - 1, Math.max(0, y));
  x = ((x % g.w) + g.w) % g.w;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const x1 = (x0 + 1) % g.w, y1 = Math.min(g.h - 1, y0 + 1), d = g.data;
  const a = d[y0 * g.w + x0], b = d[y0 * g.w + x1], c = d[y1 * g.w + x0], e = d[y1 * g.w + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
}
function resample(g, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    for (let x = 0; x < w; x++) out[y * w + x] = sample(g, -180 + ((x + 0.5) / w) * 360, lat);
  }
  return grid(w, h, out);
}

function writePng(file, w, h, rgba, colorType) {
  mkdirSync(dirname(file), { recursive: true });
  const png = new PNG({ width: w, height: h });
  png.data = rgba;
  writeFileSync(file, PNG.sync.write(png, { colorType, deflateLevel: 9 }));
}
function encodeHeight(rgba, i, metres) {
  const v = Math.max(0, Math.min(65535, Math.round(metres) + OFFSET));
  rgba[i] = v >> 8; rgba[i + 1] = v & 255; rgba[i + 2] = 0; rgba[i + 3] = 255;
}

// ---------- elevation ----------
async function buildTerrain(file) {
  const img = await (await fromFile(file)).getImage();
  const W = img.getWidth(), H = img.getHeight();
  const fmt = img.getSampleFormat ? img.getSampleFormat(0) : 3;
  log(`DEM ${W} x ${H}, sample format ${fmt}`);
  if (fmt !== 3) {
    throw new Error("The DEM must be the floating-point LOLA file (ldem_16.tif or ldem_64.tif), not an 8-bit or uint preview.");
  }
  const [band] = await img.readRasters({ samples: [0] });
  const data = Float32Array.from(band);
  let min = Infinity, max = -Infinity;
  for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
  const scale = max - min < 100 ? 1000 : 1; // CGI Moon Kit stores kilometres
  if (scale !== 1) for (let i = 0; i < data.length; i++) data[i] *= scale;
  log(`elevation range ${(min * scale).toFixed(0)} .. ${(max * scale).toFixed(0)} m`);
  const levels = pyramid(grid(W, H, data), 256);

  let count = 0;
  for (let z = 0; z <= TERRAIN_LEVELS; z++) {
    const nx = 2 ** (z + 1), ny = 2 ** z, src = pick(levels, (TERRAIN_SIZE - 1) * nx);
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
      const west = -180 + (tx * 360) / nx, north = 90 - (ty * 180) / ny;
      const dLon = 360 / nx / (TERRAIN_SIZE - 1), dLat = 180 / ny / (TERRAIN_SIZE - 1);
      const rgba = Buffer.alloc(TERRAIN_SIZE * TERRAIN_SIZE * 4);
      for (let i = 0; i < TERRAIN_SIZE; i++) for (let j = 0; j < TERRAIN_SIZE; j++) {
        encodeHeight(rgba, (i * TERRAIN_SIZE + j) * 4, sample(src, west + j * dLon, north - i * dLat));
      }
      writePng(join(OUT, "terrain", `${z}`, `${tx}`, `${ty}.png`), TERRAIN_SIZE, TERRAIN_SIZE, rgba, 2);
      count++;
    }
    log(`terrain level ${z}: ${nx * ny} tiles`);
  }

  const sg = resample(pick(levels, SHADOW_W), SHADOW_W, SHADOW_H);
  const rgba = Buffer.alloc(SHADOW_W * SHADOW_H * 4);
  for (let i = 0; i < sg.data.length; i++) encodeHeight(rgba, i * 4, sg.data[i]);
  writePng(join(OUT, "shadow-grid.png"), SHADOW_W, SHADOW_H, rgba, 2);
  log(`terrain: ${count} tiles + shadow grid`);
}

// ---------- colour ----------
async function buildColor(file) {
  const img = await (await fromFile(file)).getImage();
  const W = img.getWidth(), H = img.getHeight(), spp = img.getSamplesPerPixel();
  log(`colour ${W} x ${H}, ${spp} band(s)`);
  const bands = await img.readRasters();
  const bits = img.getBitsPerSample ? img.getBitsPerSample(0) : 8;
  const norm = bits > 8 ? 255 / (2 ** bits - 1) : 1;
  const channels = COLOR_MODE === "rgb" && spp >= 3 ? [0, 1, 2] : ["gray"];
  const planes = channels.map((c) => {
    const out = new Float32Array(W * H);
    if (c === "gray") {
      if (spp >= 3) for (let i = 0; i < out.length; i++) out[i] = (0.299 * bands[0][i] + 0.587 * bands[1][i] + 0.114 * bands[2][i]) * norm;
      else for (let i = 0; i < out.length; i++) out[i] = bands[0][i] * norm;
    } else for (let i = 0; i < out.length; i++) out[i] = bands[c][i] * norm;
    return out;
  });

  const baseW = COLOR_TILE * 2 ** (COLOR_LEVELS + 1), baseH = baseW / 2;
  const base = planes.map((p) => {
    const lv = pyramid(grid(W, H, p), baseW);
    return resample(pick(lv, baseW), baseW, baseH);
  });
  let sum = 0;
  for (const v of base[0].data) sum += v;
  const mean = sum / base[0].data.length;

  let levelGrids = base, count = 0;
  for (let z = COLOR_LEVELS; z >= 0; z--) {
    const nx = 2 ** (z + 1), ny = 2 ** z;
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
      const rgba = Buffer.alloc(COLOR_TILE * COLOR_TILE * 4);
      for (let y = 0; y < COLOR_TILE; y++) for (let x = 0; x < COLOR_TILE; x++) {
        const si = (ty * COLOR_TILE + y) * levelGrids[0].w + tx * COLOR_TILE + x, o = (y * COLOR_TILE + x) * 4;
        const r = levelGrids[0].data[si];
        const g = levelGrids.length > 1 ? levelGrids[1].data[si] : r;
        const b = levelGrids.length > 1 ? levelGrids[2].data[si] : r;
        rgba[o] = clamp8(r); rgba[o + 1] = clamp8(g); rgba[o + 2] = clamp8(b); rgba[o + 3] = 255;
      }
      writePng(join(OUT, "color", `${z}`, `${tx}`, `${ty}.png`), COLOR_TILE, COLOR_TILE, rgba, channels.length === 1 ? 0 : 2);
      count++;
    }
    log(`colour level ${z}: ${nx * ny} tiles`);
    if (z > 0) levelGrids = levelGrids.map(halve);
  }
  log(`colour: ${count} tiles, mean ${mean.toFixed(1)}`);
  return mean;
}
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

// ---------- south polar maps and region DEMs (LOLA LDEM_80S_80M, 80 m polar stereographic) ----------
// Same projection as src/regions.js: x = rho sin(lon), y = rho cos(lon), rho = 2R tan(pi/4 + lat/2).
// Hillshade matches the team pipeline (dhidru/nasa-space-apps-2026, src/pipeline/build.py): lit from the
// map's upper left (azimuth 315 deg from +y), altitude 35 deg, gray = 40 + 200 * cos(incidence).
const REGION_MARGIN_M = 10000;
function readLabel(file) {
  const out = {};
  for (const line of readFileSync(file, "latin1").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_^]+)\s*=\s*"?([^"<]*?)"?\s*(<[^>]*>)?\s*$/);
    if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return out;
}
function hillshade(H, w, h, px, zScale = 1) {
  const az = (315 * Math.PI) / 180, alt = (35 * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
  const rgba = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const cl = Math.max(0, c - 1), cr = Math.min(w - 1, c + 1), ru = Math.max(0, r - 1), rd = Math.min(h - 1, r + 1);
    const dzdx = ((H[r * w + cr] - H[r * w + cl]) / ((cr - cl) * px)) * zScale;
    const dzdy = ((H[ru * w + c] - H[rd * w + c]) / ((rd - ru) * px)) * zScale; // rows run toward -y
    const v = (-dzdx * lx - dzdy * ly + lz) / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
    const g = clamp8(40 + 200 * v), o = (r * w + c) * 4;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255;
  }
  return rgba;
}
async function buildPolar() {
  const lbl = process.env.LOLA80_LBL ? resolve(process.env.LOLA80_LBL) : await obtain(undefined, LOLA_BASE + "ldem_80s_80m.lbl");
  const img = process.env.LOLA80_IMG ? resolve(process.env.LOLA80_IMG) : await obtain(undefined, LOLA_BASE + "ldem_80s_80m.img");
  const L = readLabel(lbl);
  if (!/POLAR STEREOGRAPHIC/i.test(L.MAP_PROJECTION_TYPE || "") || L.SAMPLE_BITS !== "16" || !/LSB/i.test(L.SAMPLE_TYPE || "")) {
    throw new Error("Unexpected LOLA label: need a 16-bit LSB polar stereographic DEM");
  }
  const lines = +L.LINES, samples = +L.LINE_SAMPLES, sc = parseFloat(L.MAP_SCALE), sf = parseFloat(L.SCALING_FACTOR);
  const loff = parseFloat(L.LINE_PROJECTION_OFFSET), soff = parseFloat(L.SAMPLE_PROJECTION_OFFSET);
  const buf = readFileSync(img);
  if (buf.length !== lines * samples * 2) throw new Error(`${img}: ${buf.length} bytes, expected ${lines * samples * 2}`);
  const dn = buf.byteOffset % 2 === 0 ? new Int16Array(buf.buffer, buf.byteOffset, lines * samples) : new Int16Array(Uint8Array.from(buf).buffer);
  log(`LOLA polar DEM ${samples} x ${lines} at ${sc} m`);
  mkdirSync(POLAR, { recursive: true });

  // Home map: 400 m pixels over the whole 608 km square (5 x 5 average of the 80 m grid).
  const f = Math.max(1, Math.round(400 / sc)), hw = Math.floor(samples / f), hh = Math.floor(lines / f);
  const home = new Float32Array(hw * hh);
  for (let r = 0; r < hh; r++) for (let c = 0; c < hw; c++) {
    let s = 0;
    for (let i = 0; i < f; i++) { const row = (r * f + i) * samples + c * f; for (let j = 0; j < f; j++) s += dn[row + j]; }
    home[r * hw + c] = (s / (f * f)) * sf;
  }
  writePng(join(POLAR, "home.png"), hw, hh, hillshade(home, hw, hh, sc * f, 1.5), 0);
  const left = (0 - soff - 0.5) * sc, top = (loff + 0.5) * sc;
  const homeMeta = { image: "home.png", extent_m: [left, top - hh * f * sc, left + hw * f * sc, top], pixel_m: sc * f, width_px: hw, height_px: hh };
  log(`home map ${hw} x ${hh}`);

  const regions = {};
  for (const reg of ARTEMIS_REGIONS) {
    const xs = reg.xy.map((p) => p[0]), ys = reg.xy.map((p) => p[1]);
    const s0 = Math.max(0, Math.floor(soff + (Math.min(...xs) - REGION_MARGIN_M) / sc));
    const s1 = Math.min(samples - 1, Math.ceil(soff + (Math.max(...xs) + REGION_MARGIN_M) / sc));
    const l0 = Math.max(0, Math.floor(loff - (Math.max(...ys) + REGION_MARGIN_M) / sc));
    const l1 = Math.min(lines - 1, Math.ceil(loff - (Math.min(...ys) - REGION_MARGIN_M) / sc));
    const w = s1 - s0 + 1, h = l1 - l0 + 1, H = new Float32Array(w * h), rgba = Buffer.alloc(w * h * 4);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const v = dn[(l0 + r) * samples + s0 + c] * sf;
      H[r * w + c] = v;
      encodeHeight(rgba, (r * w + c) * 4, v);
    }
    const dir = join(POLAR, "regions", reg.id);
    writePng(join(dir, "dem.png"), w, h, rgba, 2);
    writePng(join(dir, "basemap.png"), w, h, hillshade(H, w, h, sc), 0);
    regions[reg.id] = { dem: `regions/${reg.id}/dem.png`, basemap: `regions/${reg.id}/basemap.png`, x0_m: (s0 - soff) * sc, y0_m: (loff - l0) * sc, pixel_m: sc, width_px: w, height_px: h };
    log(`region ${reg.id}: ${w} x ${h}`);
  }
  writeFileSync(join(POLAR, "meta.json"), JSON.stringify({
    version: 1,
    note: "x0_m / y0_m are the centres of the top-left pixel; rows run toward -y. Heights are metres + 32768 in red (high) / green (low).",
    offset: OFFSET, home: homeMeta, regions,
    credits: ["Elevation and hillshade: NASA LRO LOLA LDEM_80S_80M (PDS LRO-L-LOLA-4-GDR), public domain.",
      "Region outlines: USGS candidate landing regions, CC0, doi:10.5066/P1MEQ6UK."],
  }));
}

// ---------- main ----------
mkdirSync(OUT, { recursive: true });
await buildPolar();
if (onlyPolar) { log("done (polar maps only) -> public/tiles/polar"); process.exit(0); }
const demFile = await obtain(process.env.DEM_FILE, DEM_URL);
const withColor = process.argv.includes("--with-color") || !!process.env.COLOR_FILE;
await buildTerrain(demFile);
const colorMean = withColor ? await buildColor(await obtain(process.env.COLOR_FILE, COLOR_URL)) : null;

writeFileSync(join(OUT, "meta.json"), JSON.stringify({
  version: 1,
  generated: new Date().toISOString(),
  terrain: { maxLevel: TERRAIN_LEVELS, size: TERRAIN_SIZE, encoding: "rg16", offset: OFFSET, units: "m", reference: "sphere r=1737.4 km" },
  color: withColor ? { maxLevel: COLOR_LEVELS, tileSize: COLOR_TILE, mode: COLOR_MODE, mean: Number(colorMean.toFixed(2)) } : null,
  shadowGrid: { file: "shadow-grid.png", width: SHADOW_W, height: SHADOW_H, encoding: "rg16", offset: OFFSET },
  credits: [
    "Elevation: NASA LRO Lunar Orbiter Laser Altimeter (LOLA), via NASA's Scientific Visualization Studio CGI Moon Kit (SVS #4720). Public domain.",
    ...(withColor ? ["Colour: LROC WAC mosaic (Arizona State University), via NASA SVS CGI Moon Kit."] : []),
  ],
  sources: { dem: process.env.DEM_FILE || DEM_URL, ...(withColor ? { color: process.env.COLOR_FILE || COLOR_URL } : {}) },
}, null, 2));
log("done -> public/tiles");
