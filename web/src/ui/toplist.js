// SPDX-License-Identifier: MIT
// The top-10 Landing Sites list, shared by the region map card (mapview.js) and the 3D site view (main.js):
// a header row and one button per site, with coverage, worst-case Clearance and the per-site values in SITE_COLUMNS;
// and the Landing Slope limit selector that both show above it.
import { coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE, slopeLabel, SLOPE_TITLE, SLOPE_LIMITS_DEG, walkableLabel, WALKABLE_TITLE } from "./ranking.js";

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

const HEAD = `<span></span><span></span><span>Site</span><span>Coverage over the stay</span>`
  + `<span class="num" title="${esc(CLEARANCE_TITLE)}">Worst</span>`
  + SITE_COLUMNS.map((c) => `<span class="num" title="${esc(c.title)}">${c.head}</span>`).join("");

/** A <label> with a <select> of the top-10 Landing Slope limits; `limitDeg` (number or null for any) is selected. */
export function slopeLimitHtml(limitDeg) {
  const opt = (v, text) => `<option value="${v ?? ""}"${v === limitDeg ? " selected" : ""}>${text}</option>`;
  return `<label class="slope-limit" title="${esc(SLOPE_TITLE)}">Landing slope <select>`
    + SLOPE_LIMITS_DEG.map((v) => opt(v, `under ${v}°${v === 10 ? " (NASA limit)" : ""}`)).join("")
    + `${opt(null, "any")}</select></label>`;
}
/** The limit chosen in a select made by slopeLimitHtml: a number of degrees, or null for any. */
export const slopeLimitOf = (select) => (select.value === "" ? null : Number(select.value));

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
