// SPDX-License-Identifier: MIT
// The top-10 Landing Sites list, shared by the region map card (mapview.js) and the 3D site view (main.js):
// a header row and one button per site, with coverage, worst-case Clearance and the per-site values in SITE_COLUMNS;
// and the Landing Slope limit selector that both show above it.
import { coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE, slopeLabel, SLOPE_TITLE, DEFAULT_SLOPE_LIMIT_DEG, walkableLabel, WALKABLE_TITLE } from "./ranking.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CLEARANCE_TITLE = "Worst-case minimum Clearance over the stay (Sun or Earth)";

/**
 * The per-site values from sites.json (data-contract §5.3) shown after Worst, read from the team region
 * (loadTeamRegion). A new value is one entry here plus one column width in style.css (--top-cols).
 */
const SITE_COLUMNS = [
  { cls: "robust", head: "Year", title: ROBUSTNESS_TITLE, of: (team, id) => team.robustnessOf(id), label: robustnessLabel },
  { cls: "slope", head: "Slope", title: SLOPE_TITLE, of: (team, id) => team.slopeOf(id), label: slopeLabel },
  { cls: "walk", head: "EVA", title: WALKABLE_TITLE, of: (team, id) => team.walkableOf(id), label: walkableLabel },
];

const HEAD = `<span></span><span></span><span>Site</span><span>Coverage</span>`
  + `<span class="num" title="${esc(CLEARANCE_TITLE)}">Worst</span>`
  + SITE_COLUMNS.map((c) => `<span class="num" title="${esc(c.title)}">${c.head}</span>`).join("");

const SLOPE_MAX_DEG = 10; // the slider tops out at NASA's landing limit
const NASA_SLOPE_DEG = 10;
let slopeCtl = 0; // unique ids for the slider's label

/**
 * The top-10 Landing Slope limit: a 0–10° slider (up to NASA's 10° landing limit) and a "No slope filter" checkbox that turns the
 * limit off and greys the slider out. `limitDeg` is a number, or null for no filter (the slider then shows the
 * default). Read it with slopeLimitOf(); bindSlopeLimit() keeps the readout and the note in step while dragging.
 */
export function slopeLimitHtml(limitDeg) {
  const off = limitDeg === null, v = off ? DEFAULT_SLOPE_LIMIT_DEG : limitDeg, id = `slope-${++slopeCtl}`;
  const pct = (d) => `${(d / SLOPE_MAX_DEG) * 100}%`;
  return `<div class="slope-ctl${off ? " off" : ""}" title="${esc(SLOPE_TITLE)}">
      <div class="slope-row"><label for="${id}">Max slope</label><output>${off ? "off" : `${v}°`}</output></div>
      <div class="slope-track">
        <input id="${id}" type="range" min="0" max="${SLOPE_MAX_DEG}" step="1" value="${v}"${off ? " disabled" : ""} aria-describedby="${id}-note">
        <div class="slope-ticks" aria-hidden="true">${[0, 2, 4, 6, 8, 10].map((d) => `<span${d === NASA_SLOPE_DEG ? ' class="nasa"' : ""} style="left:${pct(d)}">${d}°${d === NASA_SLOPE_DEG ? " <small>NASA</small>" : ""}</span>`).join("")}</div>
      </div>
      <label class="slope-off"><input type="checkbox"${off ? " checked" : ""}> Ignore slope</label>
      <p class="slope-note" id="${id}-note">${slopeNote(off ? null : v)}</p>
    </div>`;
}
const slopeNote = (deg) => (deg === null ? "Slope ignored." : `Steeper sites are hatched and left out of the top 10.`);
/** The limit set in a control made by slopeLimitHtml (`root` is the control or an element inside it): degrees, or null. */
export function slopeLimitOf(root) {
  const ctl = root.closest(".slope-ctl") ?? root.querySelector(".slope-ctl");
  return ctl.querySelector(".slope-off input").checked ? null : Number(ctl.querySelector("input[type=range]").value);
}
/** Wire a control made by slopeLimitHtml inside `host`: live readout while dragging, onChange(limit) on release or toggle. */
export function bindSlopeLimit(host, onChange) {
  const ctl = host.querySelector(".slope-ctl"), range = ctl.querySelector("input[type=range]"), box = ctl.querySelector(".slope-off input");
  const show = () => {
    const lim = slopeLimitOf(ctl);
    ctl.classList.toggle("off", lim === null);
    range.disabled = lim === null;
    ctl.querySelector("output").textContent = lim === null ? "off" : `${lim}°`;
    ctl.querySelector(".slope-note").textContent = slopeNote(lim);
  };
  range.addEventListener("input", show);
  range.addEventListener("change", () => { show(); onChange(slopeLimitOf(ctl)); });
  box.addEventListener("change", () => { show(); onChange(slopeLimitOf(ctl)); });
}

/**
 * Fill `list` (an <ol class="top-list">) with `entries` (ranking entries, best first) and put a column header
 * just above it.
 * `team` is the region's team data (loadTeamRegion) for the per-site values; without it they show "—".
 * @param {{ team?: object|null, activeId?: string, onPick: (entry: object) => void, onHover?: (entry: object) => void }} opts
 */
export function fillTopList(list, entries, { team, activeId, onPick, onHover }) {
  let head = list.previousElementSibling;
  if (!head || !head.classList.contains("top-head")) {
    head = document.createElement("div");
    head.className = "top-head";
    head.innerHTML = HEAD;
    list.before(head);
  }
  list.replaceChildren(...entries.map((e, i) => {
    const li = document.createElement("li");
    if (e.site_id === activeId) li.className = "active";
    const label = esc(coverageLabel(e));
    li.innerHTML = `<button type="button" title="${label}"><span class="rk">${i + 1}</span>`
      + `<span class="sw" style="background:${coverageColor(e)}"></span><span class="id">${esc(e.site_id)}</span>`
      + `<span class="lb">${label}</span>`
      + `<span class="cl" title="${esc(CLEARANCE_TITLE)}">${e.worst_case_min_clearance_deg.toFixed(2)}°</span>`
      + SITE_COLUMNS.map((c) => `<span class="${c.cls}" title="${esc(c.title)}">${c.label(team ? c.of(team, e.site_id) : undefined)}</span>`).join("")
      + `</button>`;
    const b = li.querySelector("button");
    b.addEventListener("click", () => onPick(e));
    if (onHover) b.addEventListener("pointerenter", () => onHover(e));
    return li;
  }));
}
