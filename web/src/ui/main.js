// SPDX-License-Identifier: MIT
// Three views, routed by the URL hash (the site view is a three.js slice of the region's 200 m grid):
//   (empty)                 2D map of the south pole with the nine Artemis IV regions
//   #<region>               2D map of one region with its 200 m landing-site grid
//   #<region>/<site>        3D topography of one grid site, with the Sun/Earth dashboard
// Data and science come from src/science (the TypeScript port of the Python pipeline): regions, hillshades, site heights, Horizons,
// Sun/Earth positions, Clearance (track), rankings, site details and Landing Windows (src/teamdata.js, src/ranking.js).
// The 3D terrain still comes from NASA tiles built by scripts/prepare-data.mjs.
// Self-hosted fonts (SIL Open Font License 1.1, see ATTRIBUTIONS.md): Source Sans 3 for text, Merriweather for headings.
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/merriweather/700.css";
import "./style.css";
import "./map.css";
import { D, ephemeris, latlon, enu, horizontal, phaseName, fromSite, useTeamPositions } from "./ephemeris.js";
import { MoonData } from "./data.js";
import { SYNODIC_DAYS, sampleEphemeris, siteSeries, summarize, slopeDeg, visibility, discAbove } from "./metrics.js";
import { regionSites, loadSaved, saveSaved } from "./sites.js";
import { loadRegions, loadHomeBasemap, loadRegionBasemap, loadTeamRegion, loadAllPositions, siteTracks } from "./teamdata.js";
import { drawTimeline } from "./chart.js";
import { siteGrid, loadRegionDem, llToXY } from "./polar.js";
import { MapView, setBreadcrumbs } from "./mapview.js";
import { fillTopList, slopeLimitHtml, bindSlopeLimit } from "./toplist.js";
import { PatchView, gridSampler, sunVector } from "./patchview.js";
import { ranking, detail, windows, snapLandingTime, formatUtc, parseUtc, coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE, slopeLabel, SLOPE_TITLE, walkableLabel, WALKABLE_TITLE, DEFAULT_SLOPE_LIMIT_DEG, topUnderSlope, DEFAULT_LANDING, parseRoute, formatRoute, noFullStayDays, SPAN_START, SPAN_END } from "./ranking.js";
import { parseDateTime } from "../app/utctime.ts";
import { bindViewMenus } from "./viewmenu.js";
import { Calendar, calendarHtml } from "./calendar.js";
import { OrientationInset } from "./inset.js";
import { statsTable, skyPlot, timeCharts, windowsView, stayTitle, stayRange } from "./stayview.js";


const BASE = `${import.meta.env.BASE_URL}tiles`;
const START_DATE = "2026-11-18T12:00:00Z";
const SITE_STEP_H = 2;     // sampling for the region table
const CHART_STEP_H = 1;    // sampling for the timeline

const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"), mapview: $("mapview"), crumbs: $("crumbs"),
  form: $("form"), lat: $("lat"), lon: $("lon"), date: $("date"), dateGhost: $("dateGhost"), time: $("time"), sideSlope: $("sideSlope"),
  now: $("now"), hint: $("hint"), chip: $("chip"), when: $("when"),
  oSunEl: $("oSunEl"), oSunAz: $("oSunAz"), oLst: $("oLst"), oSub: $("oSub"), oEarth: $("oEarth"), oPhase: $("oPhase"),
  oElev: $("oElev"), oSlope: $("oSlope"), oSlopeLabel: $("oSlopeLabel"), oRobust: $("oRobust"), oWalk: $("oWalk"),
  shade: $("shade"), slice: $("slice"), exag: $("exag"), exagOut: $("exagOut"), loading: $("loading"),
  cSun: $("cSun"), cEarth: $("cEarth"),
  chart: $("chart"), tlSite: $("tlSite"), tlRead: $("tlRead"),
  sitesBody: $("sitesBody"), sitesWindow: $("sitesWindow"), saveSite: $("saveSite"), sitesTable: $("sitesTable"),
  oRank: $("oRank"), top10: $("top10"), topValue: $("topValue"), topWhen: $("topWhen"), topStatus: $("topStatus"), topList: $("topList"),
  stay: $("stay"), stayTitle: $("stayTitle"), stayRange: $("stayRange"), stayStatus: $("stayStatus"),
  stayDetail: $("stayDetail"), stayWindows: $("stayWindows"),
};
$("oRobustLabel").title = ROBUSTNESS_TITLE;
el.oSlopeLabel.title = SLOPE_TITLE;
$("oWalkLabel").title = WALKABLE_TITLE;

const compass16 = (az) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(az / 22.5) % 16];
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
const wrapLon = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
const fmtUTC = (d) => `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
const fmtDark = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${Math.round(h)} h`);

let polarMeta, mapView, data, dataReady, view, curDem;
let state = null, site = null; // site = {region, cell} in the site view
const demCache = new Map();        // region id -> Promise<dem>
let saved = loadSaved();
const slopeCache = new Map();
let siteRows = [];
let sort = { key: null, dir: -1 };
let chartSeries = [];

let REGIONS = [];                  // the nine regions from the team's regions.json
// Landing Time (UTC ms, 10-minute grid, inside the Supported Span) shared by the region map and the site view:
// the start of the 7-day Surface Stay that the team's ranking scores.
let landingMs = DEFAULT_LANDING;
/** Top-10 Landing Slope limit in degrees, or null for any slope; shared by the map card and the 3D view. */
let slopeLimitDeg = DEFAULT_SLOPE_LIMIT_DEG;
const allSites = () => [...REGIONS, ...saved];
const regionById = (id) => REGIONS.find((r) => r.id === id);

/* ---------- team site data (sites.json + Horizons) for regions that have it ---------- */
const teamCache = new Map();       // "sites:<id>" | "hz:<id>" -> Promise
function cached(key, make) {
  if (!teamCache.has(key)) { const p = make(); p.catch(() => teamCache.delete(key)); teamCache.set(key, p); }
  return teamCache.get(key);
}
const teamSitesFor = (id) => cached(`region:${id}`, () => loadTeamRegion(id));
/**
 * For one site with team data: { h: terrain height (m), tracks(vectors) } where tracks() runs
 * track() (src/science) for the Sun and Earth at the given position vectors. Null when the region has no site data.
 */
async function teamFor(region, cell) {
  if (!region.hasSiteData) return null;
  const tr = await teamSitesFor(region.id), h = tr.heightOf(cell.id);
  if (h === undefined) return null;
  return { h, robustness: tr.robustnessOf(cell.id), slope: tr.slopeOf(cell.id), walkable: tr.walkableOf(cell.id), tracks: (vectors) => siteTracks(tr, cell.id, vectors) };
}
/** Sun/Earth azimuth, elevation and Clearance at one instant from the team's track(), or null without km vectors. */
function teamNow(team, eph) {
  if (!team || !eph.sunKm) return null;
  const t = team.tracks([eph]);
  const pick = (b) => ({ az: b.azimuthDeg[0], el: b.elevationDeg[0], clear: b.elevationDeg[0] - b.horizonElevationDeg[0] });
  return { sun: pick(t.sun), earth: pick(t.earth) };
}
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
  // Regions overlap (Mons Mouton lies inside Mons Mouton Plateau): prefer the open region, then the smallest.
  const area = (r) => r.size[0] * r.size[1];
  const order = [...REGIONS].sort((a, b) => (site && b.id === site.region.id) - (site && a.id === site.region.id) || area(a) - area(b));
  for (const r of order) { const cell = siteGrid(r).cellAt(x, y); if (cell) return { region: r, cell }; }
  return null;
}

/* ---------- routing ----------
 * Links carry the Landing Time, so any view can be shared (src/app/route.ts):
 *   #/                                        south pole map
 *   #/region/<id>?t=20270301T0000Z            region grid
 *   #/region/<id>?t=20270301T0000Z&site=<id>  3D site view
 * Inside this file views are named "#", "#<region>" and "#<region>/<site>"; toHash() turns them into links.
 */
function toHash(path) {
  const [regionId, siteId] = path.replace(/^#/, "").split("/");
  return regionId ? formatRoute({ page: "region", regionId, landing: landingMs, siteId: siteId || undefined }) : "#/";
}
function go(path) { const h = toHash(path); if (location.hash === h) route(); else location.hash = h; }
/** Keep the address bar's Landing Time in step without reloading the view. */
function syncUrl() {
  const path = site && !el.app.hidden ? `#${site.region.id}/${site.cell.id}` : mapView && mapView.mode === "region" && mapView.region ? `#${mapView.region.id}` : "#";
  const h = toHash(path);
  if (location.hash !== h) history.replaceState(null, "", h);
}
async function route() {
  // Older links (#<region>/<site>, from the first viewer) open the same view.
  if (location.hash.length > 1 && !location.hash.startsWith("#/")) { location.replace(toHash(decodeURIComponent(location.hash))); return; }
  const r = parseRoute(location.hash);
  if (r.page === "home") return showMap(() => mapView.showHome());
  const region = regionById(r.regionId);
  if (!region) return go("#");
  landingMs = r.landing;
  if (!r.siteId) return showMap(() => mapView.showRegion(region.id, site && site.region.id === region.id ? site.cell.id : null));
  const cell = siteGrid(region).byId(r.siteId);
  if (!cell) return go(`#${region.id}`);
  await showSite(region, cell);
}

/**
 * Region map -> site view: start loading the terrain, zoom the map onto the Landing Site (clearing the rest of the
 * grid), then route. showSite() holds the zoomed map frame until the 3D slice is ready and cross-fades into its intro.
 */
let siteToken = 0; // bumped by every map or site view change, so a slower earlier load or zoom can't take over the screen
async function flyToSite(rid, cid) {
  const region = regionById(rid), cell = region && siteGrid(region).byId(cid);
  if (!cell || el.mapview.hidden) return go(`#${rid}/${cid}`);
  const token = ++siteToken;
  demFor(rid).catch(() => {});
  teamFor(region, cell).catch(() => {});
  await mapView.flyTo(cell, +el.slice.value, globeRect);
  if (token === siteToken) go(`#${rid}/${cid}`);
}
/** Where the 3D canvas sits in the site view, measured without painting it if that view is hidden. */
function globeRect() {
  if (!el.app.hidden) return $("globe").getBoundingClientRect();
  el.app.hidden = false;
  const r = $("globe").getBoundingClientRect();
  el.app.hidden = true;
  return r;
}
function showMap(render) {
  siteToken++;
  el.mapview.hidden = false;
  el.app.hidden = true;
  render();
}

async function showSite(region, cell) {
  const token = ++siteToken;
  const fromMap = !el.mapview.hidden && mapView.flying;
  const sameRegion = !!(site && site.region.id === region.id && view);
  site = { region, cell };
  if (!fromMap) el.mapview.hidden = true;
  el.app.hidden = false;
  renderCrumbs();
  const msg = region.hasSiteData ? "Loading terrain and team Horizons…" : "Loading terrain…";
  // From the map, keep its zoomed frame up with a small notice instead of the full-screen loader.
  if (fromMap) mapView.showNotice(msg);
  else if (!sameRegion) { el.loading.hidden = false; el.loading.textContent = msg; }
  let dem, team;
  try {
    [dem, team] = await Promise.all([demFor(region.id), teamFor(region, cell).catch((e) => { console.error(e); return null; })]);
  } catch (e) {
    if (token !== siteToken) return;
    console.error(e);
    const why = `Couldn't load the terrain: ${e?.message ?? e}`;
    if (fromMap) {
      el.app.hidden = true;
      mapView.abortFlight(why);
      history.replaceState(null, "", toHash(`#${region.id}`));
    } else { el.loading.hidden = false; el.loading.textContent = why; }
    return;
  }
  if (token !== siteToken) return; // the map or another site was opened meanwhile
  site.team = team;
  ensureView();
  el.loading.hidden = true;
  // Follow a Landing Time picked on the region map; otherwise keep the time already shown here.
  const shown = readInputs().date;
  setInputs(cell.lat, cell.lon, !state || Number.isNaN(shown.getTime()) || snapLandingTime(shown.getTime()) !== landingMs ? new Date(landingMs) : null);
  loadPatch(dem, fromMap ? "intro" : sameRegion ? "keep" : "reset");
  if (fromMap) mapView.fadeOut();
  await apply();
}

function renderCrumbs() {
  setBreadcrumbs(el.crumbs, [
    { text: "Lunar south pole", go: () => go("#") },
    { text: site.region.name, go: () => go(`#${site.region.id}`) },
    { text: `Site ${site.cell.id}` },
  ]);
}
/** Esc goes up one level: site view -> region map -> all regions (not while typing in a field). */
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || e.target.closest?.("input, select, textarea")) return;
  if (site && !el.app.hidden) go(`#${site.region.id}`);
  else if (mapView && mapView.mode === "region" && !mapView.flying) go("#");
});

/* ---------- inputs ---------- */
function readInputs() {
  const lat = parseFloat(el.lat.value), lonRaw = parseFloat(el.lon.value);
  const date = parseDateTime(el.date.value, el.time.value);
  const errs = [];
  if (!(lat >= -90 && lat <= 90)) errs.push("Latitude must be between −90 and 90.");
  if (!(lonRaw >= -180 && lonRaw <= 360)) errs.push("Longitude must be between −180 and 360.");
  if (Number.isNaN(date.getTime())) errs.push("Enter a date as yyyy-mm-dd and a 24-hour UTC time as hh:mm:ss.");
  return { lat, lon: wrapLon(lonRaw), date, errs };
}
function setInputs(lat, lon, date) {
  if (lat !== null) { el.lat.value = lat.toFixed(4); el.lon.value = lon.toFixed(4); }
  if (date) { const iso = date.toISOString(); el.date.value = iso.slice(0, 10); el.time.value = iso.slice(11, 19); }
  paintDateMask();
  if (date && !Number.isNaN(date.getTime())) siteCal.setChosen(date.getTime());
}

/* ---------- Date: the shared calendar, always open, plus a typed field with a grey yyyy-mm-dd mask ---------- */
const DATE_FORMAT = "yyyy-mm-dd";
/** Show the grey format behind the typed part: "2027-0" shows as 2027-0 then a grey "m-dd". */
function paintDateMask() {
  const v = el.date.value;
  el.dateGhost.innerHTML = `<i>${escapeHtml(v)}</i>${DATE_FORMAT.slice(v.length)}`;
}
$("siteCal").innerHTML = calendarHtml("Landing date");
// Picking a day keeps the typed time of day.
const siteCal = new Calendar($("siteCal"), {
  onPick: (day) => {
    const { date } = readInputs();
    const tod = Number.isNaN(date.getTime()) ? 0 : ((date.getTime() % 86400000) + 86400000) % 86400000;
    setInputs(null, null, new Date(day + tod));
    apply();
  },
});
el.date.addEventListener("input", () => {
  // digits only; the dashes go in by themselves
  const dg = el.date.value.replace(/\D/g, "").slice(0, 8);
  el.date.value = dg.slice(0, 4) + (dg.length > 4 ? `-${dg.slice(4, 6)}` : "") + (dg.length > 6 ? `-${dg.slice(6)}` : "");
  paintDateMask();
  el.date.classList.remove("bad");
  if (el.date.value.length < DATE_FORMAT.length) return;
  const { date } = readInputs();
  const t = date.getTime();
  if (Number.isNaN(t)) { el.date.classList.add("bad"); el.hint.textContent = "That date doesn't exist. Use yyyy-mm-dd."; return; }
  if (t < SPAN_START || t >= SPAN_END) {
    el.date.classList.add("bad");
    el.hint.textContent = `Pick a date from ${formatUtc(SPAN_START).slice(0, 10)} to ${formatUtc(SPAN_END - 86400000).slice(0, 10)}.`;
    return;
  }
  siteCal.setChosen(t);
  apply();
});
paintDateMask();
siteCal.draw();


/* ---------- readout ---------- */
function renderReadout(s) {
  const f = enu(s.lat, s.lon), dir = fromSite(s.eph, s.lat, s.lon, s.h);
  const tn = teamNow(site && site.team, s.eph);
  const sunH = tn ? tn.sun : horizontal(dir.sun, f), earthH = tn ? tn.earth : horizontal(dir.earth, f);
  const clr = (h) => (h.clear === undefined ? "" : ` · clearance ${h.clear >= 0 ? "+" : ""}${h.clear.toFixed(2)}°`);
  const sub = latlon(s.eph.sun);
  const lst = (((12 + wrapLon(s.lon - sub[1]) / 15) % 24) + 24) % 24;
  const hh = Math.floor(lst), mm = Math.floor((lst - hh) * 60);
  const night = sunH.el < -0.5, low = !night && sunH.el < 5;
  el.chip.className = "chip" + (night ? " night" : low ? " dusk" : "");
  el.chip.textContent = night ? "Lunar night" : low ? (lst < 12 ? "Low sun · rising" : "Low sun · setting") : "Daylight";
  el.when.textContent = fmtUTC(s.date);
  el.oSunEl.innerHTML = `<b>${sunH.el.toFixed(2)}°</b>${clr(sunH)}`;
  el.oSunAz.textContent = `${sunH.az.toFixed(1)}° ${compass16(sunH.az)}`;
  el.oLst.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  el.oSub.textContent = `${fmtLat(sub[0])}, ${fmtLon(sub[1])}`;
  el.oEarth.textContent = earthH.el > -1 ? `el ${earthH.el.toFixed(1)}°, az ${earthH.az.toFixed(0)}°${clr(earthH)}` : "Below horizon";
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
const HINT = "Scroll to zoom · click a site to open it";
function ensureView() {
  if (view) return;
  view = new PatchView($("globe"), {
    onHover: (c) => {
      el.hint.textContent = c && curDem
        ? `Site ${c.id} · ${Math.round(curDem.at(c.x, c.y)).toLocaleString()} m · slope ${curDem.slope(c.x, c.y).toFixed(1)}°`
        : HINT;
    },
    onPick: (c) => go(`#${site.region.id}/${c.id}`),
    inset: new OrientationInset($("inset")),
  });
  view.setExag(parseFloat(el.exag.value));
  view.setMode(el.shade.value);
}
/** camera: "reset" to the default view, "keep" the current one, or "intro" (the fly-in from the map). */
function loadPatch(dem, camera = "reset") {
  curDem = dem;
  view.setPatch({
    sample: gridSampler(dem), center: site.cell, sizeM: +el.slice.value,
    grid: siteGrid(site.region), outline: site.region.xy, keepCamera: camera === "keep", intro: camera === "intro",
  });
}

/* ---------- main update (site view) ---------- */
async function apply() {
  const { date, errs } = readInputs();
  if (errs.length) { el.hint.textContent = errs.join(" "); return; }
  if (!view || !site || !curDem) return;
  const { cell, team } = site, dem = curDem;
  const eph = ephemeris(date);
  const h = team ? team.h : dem.at(cell.x, cell.y);
  const windowChanged = !state || state.date.getTime() !== date.getTime();
  state = { lat: cell.lat, lon: cell.lon, date, eph, h };
  const sunH = renderReadout(state);
  el.oElev.textContent = `${Math.round(h).toLocaleString()} m`;
  el.oSlope.textContent = team?.slope !== undefined ? slopeLabel(team.slope) : `${dem.slope(cell.x, cell.y).toFixed(1)}°`;
  el.oSlopeLabel.textContent = team?.slope !== undefined ? "Landing slope" : "Slope (site)";
  el.oRobust.textContent = team ? robustnessLabel(team.robustness) : "— (no team site data)";
  el.oWalk.textContent = team ? walkableLabel(team.walkable) : "— (no team site data)";
  const sun = sunVector(sunH.az, sunH.el, cell.lon);
  view.setSun(sun, 1);
  el.hint.textContent = HINT;
  const now = state;
  await dataReady;
  if (state !== now) return;
  // Terrain beyond the slice can still hide the Sun: check the far horizon over the global terrain.
  // With team Horizons, the Sun's disc is tested against the site's Horizon (the pipeline's Clearance).
  view.setSun(sun, sunH.clear !== undefined ? discAbove(sunH.clear, 0, 0.267)
    : visibility(data, cell.lat * D, cell.lon * D, fromSite(eph, cell.lat, cell.lon, h).sun, 0.267 * D));
  landingMs = snapLandingTime(date.getTime());
  siteCal.setChosen(date.getTime());
  markNoStayDays(site.region);
  syncUrl();
  updateTopTen();
  setTimeout(() => { updateTimeline(); if (windowChanged) updateSites(); else markActive(); }, 30);
}

/** Cross out the region's No-Full-Stay Days on the site view's calendar (once per region). */
let noStayRegion = null;
function markNoStayDays(region) {
  if (noStayRegion === region.id) return;
  noStayRegion = region.id;
  siteCal.noStay = null;
  siteCal.draw();
  if (!region.hasSiteData) return;
  noFullStayDays(region.id).then((days) => {
    if (noStayRegion !== region.id) return;
    siteCal.noStay = new Set(days);
    siteCal.draw();
  }).catch((e) => console.error(e));
}

/* ---------- top 10 Landing Sites (team ranking, computed in a worker) ---------- */
let topToken = 0;
async function updateTopTen() {
  const token = ++topToken, cur = site;
  if (!cur || !cur.region.hasSiteData) {
    el.top10.hidden = true;
    el.sideSlope.hidden = true;
    el.stay.hidden = true;
    el.oRank.textContent = "— (no team site data)";
    if (view) view.setMarks([]);
    return;
  }
  el.top10.hidden = false;
  el.sideSlope.hidden = false;
  el.topWhen.textContent = `Ranked for a stay from ${formatUtc(landingMs).slice(0, 19).replace("T", " ")} UTC · ${slopeLimitDeg === null ? "no slope filter" : `max slope ${slopeLimitDeg}°`}`;
  el.topValue.textContent = "…";
  el.topStatus.textContent = "Scoring sites…";
  el.oRank.textContent = "…";
  try {
    const [r, tr] = await Promise.all([ranking(cur.region.id, landingMs, (f) => {
      if (token === topToken) el.topStatus.textContent = `Scoring sites… ${Math.round(f * 100)} %`;
    }), teamSitesFor(cur.region.id).catch(() => null)]);
    if (token !== topToken) return;
    const top = topUnderSlope(r, tr, slopeLimitDeg);
    el.topStatus.textContent = slopeLimitDeg !== null && !tr?.region.landingSlopeDeg ? "No Landing Slopes for this region, so the slope limit is off." : "";
    const grid = siteGrid(cur.region);
    renderTopList(top, cur, tr);
    const me = r.byId.get(cur.cell.id);
    el.oRank.textContent = me ? `${me.rank.toLocaleString()} of ${r.doc.sites.length.toLocaleString()}${top.some((e) => e.site_id === me.site_id) ? " · top 10" : ""} · ${coverageLabel(me)}` : "—";
    view.setMarks(top.map((e, i) => ({ cell: grid.byId(e.site_id), color: coverageColor(e), rank: i + 1 })).filter((m) => m.cell));
    updateStay(cur, me, token);
  } catch (e) {
    if (token !== topToken) return;
    console.error(e);
    el.topStatus.textContent = `Couldn't rank the sites: ${e.message}`;
    el.oRank.textContent = "—";
  }
}
/* ---------- Surface Stay: stats, sky plot, time charts, Landing Windows (src/ui/stayview.js) ---------- */
let windowsKey = null;
async function updateStay(cur, entry, token) {
  el.stay.hidden = false;
  el.stayTitle.innerHTML = stayTitle(cur.cell.id, entry);
  el.stayStatus.textContent = "Working out the week…";
  const key = `${cur.region.id}|${cur.cell.id}`;
  if (key !== windowsKey) { windowsKey = key; resetWindows(); } else refreshWindows();
  try {
    const doc = await detail(cur.region.id, landingMs, cur.cell.id);
    if (token !== topToken) return;
    el.stayStatus.textContent = "";
    el.stayRange.textContent = stayRange(doc);
    el.stayDetail.innerHTML = `<h3>Over the 7-day stay</h3>${statsTable(doc)}<h3>Sky plot</h3>${skyPlot(doc)}<h3>Sun and Earth above the terrain</h3>${timeCharts(doc)}`;
  } catch (e) {
    if (token !== topToken) return;
    console.error(e);
    el.stayStatus.textContent = `Couldn't compute the Surface Stay: ${e.message}`;
  }
}
let windowsShown = false;
function resetWindows() {
  windowsShown = false;
  el.stayWindows.innerHTML = `<button type="button" class="go" id="findWindows">Find Landing Windows</button>`;
  el.stayWindows.querySelector("#findWindows").addEventListener("click", () => showWindows());
}
function refreshWindows() { if (windowsShown) showWindows(); }
async function showWindows() {
  const cur = site, key = windowsKey;
  if (!cur) return;
  windowsShown = true;
  if (!el.stayWindows.querySelector("table, svg")) el.stayWindows.innerHTML = `<p class="status">Checking every Landing Time in the Supported Span…</p>`;
  try {
    const doc = await windows(cur.region.id, cur.cell.id);
    if (key !== windowsKey) return;
    el.stayWindows.innerHTML = windowsView(doc, landingMs);
    // Table rows and the green Full Coverage runs on the strip both set the Landing Time.
    el.stayWindows.querySelectorAll("[data-t]").forEach((n) => {
      const land = () => { setInputs(null, null, new Date(parseUtc(n.dataset.t))); apply(); };
      n.addEventListener("click", land);
      if (n.matches(".seg-full")) n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); land(); } });
    });
  } catch (e) {
    if (key !== windowsKey) return;
    console.error(e);
    el.stayWindows.innerHTML = `<p class="status">Couldn't find Landing Windows: ${escapeHtml(e.message)}</p>`;
  }
}
function renderTopList(top, cur, tr) {
  fillTopList(el.topList, top, {
    team: tr,
    activeId: cur.cell.id,
    onPick: (e) => { openTop(false); go(`#${cur.region.id}/${e.site_id}`); },
  });
  const k = top.findIndex((e) => e.site_id === cur.cell.id);
  el.topValue.textContent = k >= 0 ? `#${k + 1} of ${top.length}` : `${top.length} sites`;
}

/* ---------- timeline ---------- */
function updateTimeline() {
  if (!state) return;
  el.tlSite.textContent = (site ? `${site.region.name} · ${site.cell.id}` : `${fmtLat(state.lat)}, ${fmtLon(state.lon)}`)
    + (site && site.team ? " · team Horizon" : "");
  const samples = sampleEphemeris(state.date, SYNODIC_DAYS, CHART_STEP_H);
  chartSeries = siteSeries(data, state.lat, state.lon, samples, site && site.team);
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
  const [meta, regions, homeBasemap] = await Promise.all([res.json(), loadRegions(), loadHomeBasemap()]);
  polarMeta = meta;
  REGIONS = regionSites(regions);
  // Team SPICE positions (2026-2027) replace Astronomy Engine's Sun/Earth vectors once they arrive.
  loadAllPositions().then((p) => { useTeamPositions(p); if (site && !el.app.hidden) apply(); }).catch((e) => console.error(e));
  // The site view's Max slope sits in the left pane; the region map has its own copy in the Landing Time picker.
  const showSlopeLimit = () => {
    el.sideSlope.innerHTML = slopeLimitHtml(slopeLimitDeg);
    bindSlopeLimit(el.sideSlope, (limit) => { slopeLimitDeg = limit; updateTopTen(); });
  };
  showSlopeLimit();
  mapView = new MapView(el.mapview, {
    homeBasemap, regionBasemap: loadRegionBasemap, teamSites: teamSitesFor, regions: REGIONS,
    ranking, getLanding: () => landingMs, setLanding: (t) => { landingMs = snapLandingTime(t); syncUrl(); },
    getSlopeLimit: () => slopeLimitDeg, setSlopeLimit: (deg) => { slopeLimitDeg = deg; showSlopeLimit(); },
    // Opening a region from the home map starts with no Landing Time chosen (a shared link or a return from a site keeps its own).
    onRegion: (id) => { mapView.picked = false; go(`#${id}`); },
    onSite: (rid, cid) => flyToSite(rid, cid),
    onHome: () => go("#"),
    demFor,
  });
  mapView.picked = /[?&]t=/.test(location.hash); // a shared link names its Landing Time
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
  if (!f) { el.hint.textContent = `${fmtLat(lat)}, ${fmtLon(lon)} is outside the nine Artemis IV regions.`; return; }
  if (site && f.cell.id === site.cell.id && f.region.id === site.region.id) apply();
  else go(`#${f.region.id}/${f.cell.id}`);
});
// −1 d / −1 h / +1 h / +1 d, as in the Landing Time picker on the region map.
for (const b of document.querySelectorAll("#form .steps button")) b.addEventListener("click", () => {
  const { date } = readInputs();
  if (Number.isNaN(date.getTime())) return;
  setInputs(null, null, new Date(date.getTime() + Number(b.dataset.step)));
  apply();
});
el.now.addEventListener("click", () => {
  const d = new Date(); d.setUTCMilliseconds(0);
  setInputs(null, null, d);
  apply();
});
bindViewMenus(el.app);
// The site view's Top 10 is a menu in the 3D view's top bar: hover or click opens it, Esc or leaving closes it.
const topBtn = $("topToggle");
function openTop(on) { el.top10.classList.toggle("open", on); topBtn.setAttribute("aria-expanded", String(on)); }
let topHoverAt = 0; // a click right after the hover opened the menu keeps it open instead of closing it
el.top10.addEventListener("pointerenter", () => { topHoverAt = performance.now(); openTop(true); });
el.top10.addEventListener("pointerleave", () => openTop(false));
topBtn.addEventListener("click", () => openTop(performance.now() - topHoverAt < 500 || !el.top10.classList.contains("open")));
el.top10.addEventListener("focusout", (e) => { if (!el.top10.contains(e.relatedTarget)) openTop(false); });
el.top10.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); openTop(false); topBtn.focus(); }
  if (e.key === "ArrowDown" && !el.top10.classList.contains("open")) { e.preventDefault(); openTop(true); el.topList.querySelector("button")?.focus(); }
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
  el.loading.textContent = `Couldn't start the app: ${e?.message ?? e}`;
});
