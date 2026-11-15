// SPDX-License-Identifier: MIT
// Standalone preview of the 3D grid-slice view (PatchView) for Mons Mouton, using the team's processed data:
// 200 m site heights and the 20 m LOLA hillshade (dhidru/nasa-space-apps-2026, data/processed/site-data).
import { PatchView, gridSampler, sunVector } from "../src/patchview.js";
import { siteGrid } from "../src/polar.js";
import { ARTEMIS_REGIONS } from "../src/regions.js";
import { ephemeris, enu, horizontal } from "../src/ephemeris.js";

const P = window.PREVIEW;
const region = ARTEMIS_REGIONS.find((r) => r.id === "mons-mouton");
const grid = siteGrid(region);
const sample = gridSampler(P.heights);
const $ = (id) => document.getElementById(id);
let cell = grid.byId(location.hash.slice(1)) || grid.byId("r036c038");

const img = new Image();
img.src = P.texture.src;

const view = new PatchView($("stage"), {
  onHover: (c) => read(c || cell),
  onPick: (c) => { cell = c; history.replaceState(null, "", `#${c.id}`); load(true); },
});

function slope(x, y) {
  const s = 100, gx = (sample(x + s, y) - sample(x - s, y)) / (2 * s), gy = (sample(x, y + s) - sample(x, y - s)) / (2 * s);
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
}
function read(c) {
  $("rid").textContent = c.id;
  $("rlat").textContent = `${Math.abs(c.lat).toFixed(4)}° S, ${c.lon.toFixed(4)}° E`;
  $("rh").textContent = `${Math.round(sample(c.x, c.y)).toLocaleString()} m`;
  $("rs").textContent = `${slope(c.x, c.y).toFixed(1)}°`;
}
function sunNow() {
  const d = new Date(`${$("date").value}T${$("time").value || "00:00"}:00Z`);
  if (Number.isNaN(d.getTime())) return;
  const h = horizontal(ephemeris(d).sun, enu(cell.lat, cell.lon));
  $("rsun").textContent = `el ${h.el.toFixed(2)}°, az ${h.az.toFixed(0)}°`;
  view.setSun(sunVector(h.az, h.el, cell.lon), 1);
}
function load(keepCamera) {
  view.setPatch({
    sample, center: cell, sizeM: +$("size").value, grid, outline: region.xy,
    texture: { image: img, extent: P.texture.extent }, keepCamera,
  });
  read(cell);
  sunNow();
}
$("mode").addEventListener("change", () => view.setMode($("mode").value));
$("size").addEventListener("change", () => load(false));
$("exag").addEventListener("input", () => { $("exagOut").textContent = `${$("exag").value}×`; view.setExag(+$("exag").value); });
$("date").addEventListener("change", sunNow);
$("time").addEventListener("change", sunNow);
$("noon").addEventListener("click", () => {
  // highest Sun at this site within ±15 days of the chosen date, hourly
  const base = new Date(`${$("date").value}T12:00:00Z`).getTime(); let best = null;
  for (let k = -360; k <= 360; k++) {
    const t = new Date(base + k * 3600000), el = horizontal(ephemeris(t).sun, enu(cell.lat, cell.lon)).el;
    if (!best || el > best.el) best = { t, el };
  }
  const iso = best.t.toISOString(); $("date").value = iso.slice(0, 10); $("time").value = iso.slice(11, 16);
  sunNow();
});
view.setMode($("mode").value);
img.onload = () => load(false);
