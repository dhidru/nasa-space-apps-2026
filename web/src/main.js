// SPDX-License-Identifier: MIT
// Three views, routed by the URL hash (the site view is a three.js slice of the region's 200 m grid):
//   (empty)                 2D map of the south pole with the nine Artemis III regions
//   #<region>               2D map of one region with its 200 m landing-site grid
//   #<region>/<site>        3D topography of one grid site, with the Sun/Earth dashboard
import "./style.css";
import "./map.css";
import { D, ephemeris, latlon, enu, horizontal, phaseName } from "./ephemeris.js";
import { MoonData } from "./data.js";
import { SYNODIC_DAYS, sampleEphemeris, siteSeries, summarize, slopeDeg, visibility } from "./metrics.js";
import { DEFAULT_SITES, loadSaved, saveSaved } from "./sites.js";
import { drawTimeline } from "./chart.js";
import { siteGrid, loadRegionDem, llToXY } from "./polar.js";
import { MapView } from "./mapview.js";
import { PatchView, gridSampler, sunVector } from "./patchview.js";


const BASE = "/tiles";
const START_DATE = "2026-11-18T12:00:00Z";
const SITE_STEP_H = 2;     // sampling for the region table
const CHART_STEP_H = 1;    // sampling for the timeline

const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"), mapview: $("mapview"), crumbs: $("crumbs"),
  form: $("form"), lat: $("lat"), lon: $("lon"), date: $("date"), time: $("time"),
  now: $("now"), hint: $("hint"), chip: $("chip"), when: $("when"),
  oSunEl: $("oSunEl"), oSunAz: $("oSunAz"), oLst: $("oLst"), oSub: $("oSub"), oEarth: $("oEarth"), oPhase: $("oPhase"),
  oElev: $("oElev"), oSlope: $("oSlope"),
  shade: $("shade"), slice: $("slice"), exag: $("exag"), exagOut: $("exagOut"), loading: $("loading"),
  cSun: $("cSun"), cEarth: $("cEarth"),
  chart: $("chart"), tlSite: $("tlSite"), tlRead: $("tlRead"),
  sitesBody: $("sitesBody"), sitesWindow: $("sitesWindow"), saveSite: $("saveSite"), sitesTable: $("sitesTable"),
};

const compass16 = (az) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(az / 22.5) % 16];
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
const wrapLon = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
const fmtUTC = (d) => `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
const fmtDark = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${Math.round(h)} h`);

let polarMeta, mapView, data, dataReady, view, curDem;
let state = null, site = null; // site = {region, cell} in the site view
const demCache = new Map();        // region id -> Promise<dem>
let saved = loadSaved();
const slopeCache = new Map();
let siteRows = [];
let sort = { key: null, dir: -1 };
let chartSeries = [];

const allSites = () => [...DEFAULT_SITES, ...saved];
const regionById = (id) => DEFAULT_SITES.find((r) => r.id === id);
const siteAt = (lat, lon) => allSites().find((s) => Math.abs(s.lat - lat) < 0.006 && Math.abs(wrapLon(s.lon - lon)) < 0.006);

/* ---------- region terrain (80 m DEM) ---------- */
function demFor(id) {
  if (!demCache.has(id)) {
    const p = loadRegionDem(`${BASE}/polar`, polarMeta, id);
    p.catch(() => demCache.delete(id));
    demCache.set(id, p);
    // Blend it into the global terrain used for Sun/Earth visibility and slopes.
    Promise.all([p, dataReady]).then(([dem]) => data.addDem(dem)).catch(() => {});
  }
  return demCache.get(id);
}
/** The Artemis region and grid site containing a coordinate, or null. */
function cellFor(lat, lon) {
  const [x, y] = llToXY(lat, lon);
  for (const r of DEFAULT_SITES) { const cell = siteGrid(r).cellAt(x, y); if (cell) return { region: r, cell }; }
  return null;
}

/* ---------- routing ---------- */
function go(hash) { const t = hash === "#" ? "" : hash; if (location.hash === t) route(); else location.hash = t; }
async function route() {
  const [regionId, cellId] = decodeURIComponent(location.hash.slice(1)).split("/");
  const region = regionId && regionById(regionId);
  if (!region) return showMap(() => mapView.showHome());
  if (!cellId) return showMap(() => mapView.showRegion(region.id, site && site.region.id === region.id ? site.cell.id : null));
  const cell = siteGrid(region).byId(cellId);
  if (!cell) return go(`#${region.id}`);
  await showSite(region, cell);
}

function showMap(render) {
  el.mapview.hidden = false;
  el.app.hidden = true;
  render();
}

async function showSite(region, cell) {
  const sameRegion = !!(site && site.region.id === region.id && view);
  site = { region, cell };
  el.mapview.hidden = true;
  el.app.hidden = false;
  renderCrumbs();
  if (!sameRegion) { el.loading.hidden = false; el.loading.textContent = "Loading terrain…"; }
  const dem = await demFor(region.id);
  if (site.cell !== cell) return; // another site was opened meanwhile
  ensureView();
  el.loading.hidden = true;
  setInputs(cell.lat, cell.lon, state ? null : new Date(START_DATE));
  loadPatch(dem, sameRegion);
  await apply();
}

function renderCrumbs() {
  const items = [
    { text: "Lunar south pole", hash: "" },
    { text: site.region.name, hash: `#${site.region.id}` },
    { text: `Site ${site.cell.id}` },
  ];
  el.crumbs.replaceChildren(...items.flatMap((it, i) => {
    const n = it.hash !== undefined
      ? Object.assign(document.createElement("button"), { type: "button", textContent: it.text, onclick: () => go(it.hash || "#") })
      : Object.assign(document.createElement("span"), { textContent: it.text });
    return i ? [Object.assign(document.createElement("span"), { className: "sep", textContent: "›" }), n] : [n];
  }));
}

/* ---------- inputs ---------- */
function readInputs() {
  const lat = parseFloat(el.lat.value), lonRaw = parseFloat(el.lon.value);
  const date = new Date(`${el.date.value}T${el.time.value || "00:00"}:00Z`);
  const errs = [];
  if (!(lat >= -90 && lat <= 90)) errs.push("Latitude must be between −90 and 90.");
  if (!(lonRaw >= -180 && lonRaw <= 360)) errs.push("Longitude must be between −180 and 360.");
  if (Number.isNaN(date.getTime())) errs.push("Enter a date and time.");
  return { lat, lon: wrapLon(lonRaw), date, errs };
}
function setInputs(lat, lon, date) {
  if (lat !== null) { el.lat.value = lat.toFixed(4); el.lon.value = lon.toFixed(4); }
  if (date) { const iso = date.toISOString(); el.date.value = iso.slice(0, 10); el.time.value = iso.slice(11, 16); }
}

/* ---------- readout ---------- */
function renderReadout(s) {
  const f = enu(s.lat, s.lon);
  const sunH = horizontal(s.eph.sun, f), earthH = horizontal(s.eph.earth, f);
  const sub = latlon(s.eph.sun);
  const lst = (((12 + wrapLon(s.lon - sub[1]) / 15) % 24) + 24) % 24;
  const hh = Math.floor(lst), mm = Math.floor((lst - hh) * 60);
  const night = sunH.el < -0.5, low = !night && sunH.el < 5;
  el.chip.className = "chip" + (night ? " night" : low ? " dusk" : "");
  el.chip.textContent = night ? "Lunar night" : low ? (lst < 12 ? "Low sun · rising" : "Low sun · setting") : "Daylight";
  el.when.textContent = fmtUTC(s.date);
  el.oSunEl.innerHTML = `<b>${sunH.el.toFixed(2)}°</b>`;
  el.oSunAz.textContent = `${sunH.az.toFixed(1)}° ${compass16(sunH.az)}`;
  el.oLst.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  el.oSub.textContent = `${fmtLat(sub[0])}, ${fmtLon(sub[1])}`;
  el.oEarth.textContent = earthH.el > -1 ? `el ${earthH.el.toFixed(1)}°, az ${earthH.az.toFixed(0)}°` : "Below horizon";
  el.oPhase.textContent = `${phaseName(s.eph.phaseAngle)} · ${(s.eph.illum * 100).toFixed(0)}%`;
  const place = (g, h) => {
    const r = 40 * (1 - Math.max(0, h.el) / 90);
    g.setAttribute("transform", `translate(${(r * Math.sin(h.az * D)).toFixed(1)} ${(-r * Math.cos(h.az * D)).toFixed(1)})`);
    g.style.opacity = h.el < 0 ? 0.25 : 1;
  };
  place(el.cSun, sunH);
  place(el.cEarth, earthH);
  return sunH;
}

async function slopeFor(lat, lon) {
  const k = `${lat.toFixed(4)},${lon.toFixed(4)},${data.dems.length}`;
  if (!slopeCache.has(k)) slopeCache.set(k, await slopeDeg(data, lat, lon));
  return slopeCache.get(k);
}

/* ---------- 3D grid slice ---------- */
const HINT = "Drag to orbit, right-drag to pan, scroll to zoom. Click a cell to move to it.";
function ensureView() {
  if (view) return;
  view = new PatchView($("globe"), {
    onHover: (c) => {
      el.hint.textContent = c && curDem
        ? `Site ${c.id} · ${Math.round(curDem.at(c.x, c.y)).toLocaleString()} m · slope ${curDem.slope(c.x, c.y).toFixed(1)}°`
        : HINT;
    },
    onPick: (c) => go(`#${site.region.id}/${c.id}`),
  });
  view.setExag(parseFloat(el.exag.value));
  view.setMode(el.shade.value);
}
function loadPatch(dem, keepCamera = false) {
  curDem = dem;
  view.setPatch({
    sample: gridSampler(dem), center: site.cell, sizeM: +el.slice.value,
    grid: siteGrid(site.region), outline: site.region.xy, keepCamera,
  });
}

/* ---------- main update (site view) ---------- */
async function apply() {
  const { date, errs } = readInputs();
  if (errs.length) { el.hint.textContent = errs.join(" "); return; }
  if (!view || !site || !curDem) return;
  const { cell } = site, dem = curDem;
  const eph = ephemeris(date);
  const h = dem.at(cell.x, cell.y);
  const windowChanged = !state || state.date.getTime() !== date.getTime();
  state = { lat: cell.lat, lon: cell.lon, date, eph, h };
  const sunH = renderReadout(state);
  el.oElev.textContent = `${Math.round(h).toLocaleString()} m`;
  el.oSlope.textContent = `${dem.slope(cell.x, cell.y).toFixed(1)}°`;
  const sun = sunVector(sunH.az, sunH.el, cell.lon);
  view.setSun(sun, 1);
  el.hint.textContent = HINT;
  const now = state;
  await dataReady;
  if (state !== now) return;
  // Terrain beyond the slice can still hide the Sun: check the far horizon over the global terrain.
  view.setSun(sun, visibility(data, cell.lat * D, cell.lon * D, eph.sun, 0.267 * D));
  setTimeout(() => { updateTimeline(); if (windowChanged) updateSites(); else markActive(); }, 30);
}

/* ---------- timeline ---------- */
function updateTimeline() {
  if (!state) return;
  el.tlSite.textContent = site ? `${site.region.name} · ${site.cell.id}` : `${fmtLat(state.lat)}, ${fmtLon(state.lon)}`;
  const samples = sampleEphemeris(state.date, SYNODIC_DAYS, CHART_STEP_H);
  chartSeries = siteSeries(data, state.lat, state.lon, samples);
  renderChart();
}
function renderChart() {
  if (!state || el.app.hidden) return;
  drawTimeline(el.chart, chartSeries, state.date, {
    onPick: (t) => { setInputs(null, null, t); apply(); },
    onHover: (p) => {
      el.tlRead.textContent = p
        ? `${fmtUTC(p.t)} · Sun ${p.sunEl.toFixed(1)}°${p.sunVis < 0.5 ? " (hidden)" : ""} · Earth ${p.earthEl.toFixed(1)}°${p.earthVis < 0.5 ? " (hidden)" : ""}`
        : "Hover to read · click to jump";
    },
  });
}

/* ---------- region comparison ---------- */
async function updateSites() {
  if (!state) return;
  const t0 = new Date(state.date.getTime() - (SYNODIC_DAYS / 2) * 86400000);
  const t1 = new Date(state.date.getTime() + (SYNODIC_DAYS / 2) * 86400000);
  const short = (d) => `${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
  el.sitesWindow.textContent = `${short(t0)} – ${short(t1)}`;
  const samples = sampleEphemeris(state.date, SYNODIC_DAYS, SITE_STEP_H);
  siteRows = allSites().map((s) => ({ site: s, metrics: { ...summarize(siteSeries(data, s.lat, s.lon, samples), SITE_STEP_H), slope: null } }));
  renderSites();
  await Promise.all(siteRows.map(async (r) => { r.metrics.slope = await slopeFor(r.site.lat, r.site.lon); }));
  renderSites();
}

function renderSites() {
  const rows = [...siteRows];
  if (sort.key) {
    rows.sort((a, b) => {
      const va = sort.key === "name" ? a.site.name : a.metrics[sort.key];
      const vb = sort.key === "name" ? b.site.name : b.metrics[sort.key];
      if (va === null) return 1;
      if (vb === null) return -1;
      return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * sort.dir;
    });
  }
  el.sitesTable.querySelectorAll("th button").forEach((b) => {
    if (b.dataset.sort === sort.key) b.setAttribute("aria-sort", sort.dir > 0 ? "ascending" : "descending");
    else b.removeAttribute("aria-sort");
  });
  el.sitesBody.replaceChildren(...rows.map(({ site: s, metrics: m }) => {
    const tr = document.createElement("tr");
    tr.dataset.id = s.id;
    tr.tabIndex = 0;
    tr.innerHTML = `
      <td><div class="site-name"><span>${escapeHtml(s.name)}${s.size ? `<small class="site-size">${s.size[0].toFixed(0)} × ${s.size[1].toFixed(0)} km</small>` : ""}</span>${s.custom ? `<button type="button" class="remove" aria-label="Remove ${escapeHtml(s.name)}">×</button>` : ""}</div></td>
      <td class="num">${m.sunPct.toFixed(0)}%<span class="bar bar-sun"><i style="width:${m.sunPct.toFixed(0)}%"></i></span></td>
      <td class="num">${m.earthPct.toFixed(0)}%<span class="bar bar-earth"><i style="width:${m.earthPct.toFixed(0)}%"></i></span></td>
      <td class="num">${fmtDark(m.longestDarkH)}</td>
      <td class="num">${m.slope === null ? '<span class="pending">…</span>' : `${m.slope.toFixed(1)}°`}</td>`;
    const open = () => {
      if (s.region) { go(`#${s.id}`); return; }
      const f = cellFor(s.lat, s.lon);
      if (f) go(`#${f.region.id}/${f.cell.id}`);
    };
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".remove")) { removeSite(s.id); return; }
      open();
    });
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    return tr;
  }));
  markActive();
}

function markActive() {
  const r = site && site.region;
  el.sitesBody.querySelectorAll("tr").forEach((tr) => tr.classList.toggle("active", !!r && tr.dataset.id === r.id));
}

function removeSite(id) {
  saved = saved.filter((s) => s.id !== id);
  saveSaved(saved);
  siteRows = siteRows.filter((r) => r.site.id !== id);
  renderSites();
}

el.saveSite.addEventListener("click", () => {
  const { lat, lon, errs } = readInputs();
  if (errs.length) { el.hint.textContent = errs.join(" "); return; }
  if (siteAt(lat, lon)) { el.hint.textContent = "That spot is already in the list."; return; }
  const name = site ? `${site.region.name} · ${site.cell.id}` : `${fmtLat(lat)}, ${fmtLon(lon)}`;
  saved.push({ id: `saved-${Date.now()}`, name, lat, lon, custom: true });
  saveSaved(saved);
  updateSites();
  el.hint.textContent = "Saved to this browser's list.";
});

el.sitesTable.querySelector("thead").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sort]");
  if (!b) return;
  const key = b.dataset.sort;
  sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === "name" || key === "longestDarkH" || key === "slope" ? 1 : -1 };
  renderSites();
});

/* ---------- boot ---------- */
async function boot() {
  const res = await fetch(`${BASE}/polar/meta.json`);
  if (!res.ok) throw new Error(`Missing ${BASE}/polar/meta.json. Run "npm run data" to build the NASA maps.`);
  polarMeta = await res.json();
  mapView = new MapView(el.mapview, {
    base: BASE, meta: polarMeta, regions: DEFAULT_SITES,
    onRegion: (id) => go(`#${id}`),
    onSite: (rid, cid) => go(`#${rid}/${cid}`),
    onHome: () => go("#"),
    demFor,
  });
  dataReady = MoonData.load(BASE).then((d) => { data = d; return d; });
  dataReady.catch((e) => { console.error(e); el.loading.hidden = false; el.loading.textContent = `Couldn't load the 3D terrain: ${e?.message ?? e}`; });
  el.loading.hidden = true;
  window.addEventListener("hashchange", route);
  await route();
}

// A typed coordinate inside a region opens that grid site; a new date or time relights the current one.
el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const { lat, lon, errs } = readInputs();
  if (errs.length) { el.hint.textContent = errs.join(" "); return; }
  const f = cellFor(lat, lon);
  if (!f) { el.hint.textContent = `${fmtLat(lat)}, ${fmtLon(lon)} is outside the nine Artemis III regions.`; return; }
  if (site && f.cell.id === site.cell.id && f.region.id === site.region.id) apply();
  else go(`#${f.region.id}/${f.cell.id}`);
});
el.now.addEventListener("click", () => {
  const d = new Date(); d.setUTCSeconds(0, 0);
  setInputs(null, null, d);
  apply();
});
el.shade.addEventListener("change", () => { if (view) view.setMode(el.shade.value); });
el.slice.addEventListener("change", () => { if (view && curDem) loadPatch(curDem); });
el.exag.addEventListener("input", () => {
  const v = parseFloat(el.exag.value);
  el.exagOut.textContent = `${v}×`;
  if (view) view.setExag(v);
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 150); });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

boot().catch((e) => {
  console.error(e);
  el.loading.hidden = false;
  el.loading.textContent = `Couldn't start the viewer: ${e?.message ?? e}`;
});
