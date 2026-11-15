// SPDX-License-Identifier: MIT
// The top-10 Landing Sites list, shared by the region map card (mapview.js) and the 3D site view (main.js):
// a header row and one button per site, with coverage, worst-case Clearance and Timing Robustness.
import { coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE } from "./ranking.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CLEARANCE_TITLE = "Worst-case minimum Clearance over the stay (Sun or Earth)";

const HEAD = `<span></span><span></span><span>Site</span><span>Coverage over the stay</span>`
  + `<span class="num" title="${esc(CLEARANCE_TITLE)}">Worst</span><span class="num" title="${esc(ROBUSTNESS_TITLE)}">Year</span>`;

/**
 * Fill `list` (an <ol class="top-list">) with `entries` (ranking entries, best first) and put a column header
 * just above it.
 * @param {{ robustnessOf?: (siteId: string) => number|undefined, activeId?: string,
 *           onPick: (entry: object) => void, onHover?: (entry: object) => void }} opts
 */
export function fillTopList(list, entries, { robustnessOf, activeId, onPick, onHover }) {
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
      + `<span class="robust" title="${esc(ROBUSTNESS_TITLE)}">${robustnessLabel(robustnessOf?.(e.site_id))}</span></button>`;
    const b = li.querySelector("button");
    b.addEventListener("click", () => onPick(e));
    if (onHover) b.addEventListener("pointerenter", () => onHover(e));
    return li;
  }));
}
