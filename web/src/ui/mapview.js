// SPDX-License-Identifier: MIT
// 2D south polar map: the home view (all nine Artemis III regions) and the region view (200 m site grid).
// Map coordinates are polar stereographic metres (src/polar.js); SVG y is the negative of map y.
// Hillshades, outlines and site heights come from the team's site-data (src/teamdata.js).

import { GRID_M, siteGrid, bbox, xyToLL } from "./polar.js";
import { sizeKm } from "./regions.js";
import { prefersReducedMotion, easeInOutCubic, phase, SLICE_FIT_MARGIN } from "./transition.js";
import { fillTopList, slopeLimitHtml, slopeLimitOf } from "./toplist.js";
import { formatUtc, coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE, slopeLabel, underSlopeLimit, SLOPE_TITLE, walkableLabel, WALKABLE_TITLE, topUnderSlope, darkDays, SPAN_START, SPAN_END, DAY_MS, FULL_HIGH, PARTIAL_HIGH, PARTIAL_LOW, rgb } from "./ranking.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

// Label anchors (map metres) and text alignment, placed by hand so the clustered regions stay readable.
const LABELS = {
  "peak-near-cabeus-b": { x: -196000, y: 70000, a: "end" },
  "haworth": { x: -56000, y: 100000, a: "end" },
  "malapert-massif": { x: -1000, y: 141000, a: "middle" },
  "mons-mouton-plateau": { x: 88000, y: 186000, a: "middle" },
  "mons-mouton": { x: 61000, y: 104000, a: "end" },
  "nobile-rim-1": { x: 90000, y: 90000, a: "middle" },
  "nobile-rim-2": { x: 173000, y: 95000, a: "start" },
  "de-gerlache-rim-2": { x: -64000, y: 23000, a: "end" },
  "slater-plain": { x: 86000, y: -50000, a: "start" },
};
const LAT_RINGS = [-80, -82, -84, -86, -88, -89]; // dashed parallels for orientation
const LON_STEP = 30; // meridians every 30°
const lonText = (lon) => (lon === 0 ? "0° (Earth)" : lon === 180 ? "180°" : lon < 180 ? `${lon}° E` : `${360 - lon}° W`);
/** "84.12° S, 35.40° E" for a map point. */
export function llText(x, y) {
  const [lat, lon] = xyToLL(x, y);
  return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`;
}

export class MapView {
  /**
   * @param {HTMLElement} root  the #mapview element
   * @param {{ homeBasemap:object, regionBasemap:(region)=>Promise<object>, teamSites:(id)=>Promise<object|null>,
   *           regions:object[], onRegion:(id)=>void, onSite:(regionId, cellId)=>void,
   *           onHome:()=>void, demFor:(id)=>Promise<object>, getLanding:()=>number, setLanding:(t)=>void,
   *           getSlopeLimit:()=>number|null, setSlopeLimit:(deg:number|null)=>void }} opts
   */
  constructor(root, opts) {
    Object.assign(this, opts);
    this.root = root;
    this.stage = root.querySelector(".map-stage");
    this.svg = svgEl("svg", { class: "map-svg", role: "img" }, this.stage);
    this.labels = Object.assign(document.createElement("div"), { className: "map-labels clears-on-flight" });
    this.stage.appendChild(this.labels);
    this.card = root.querySelector(".map-card");
    this.crumbs = root.querySelector(".map-crumbs");
    this.zoomHint = root.querySelector(".map-zoomhint");
    this.cursorLL = root.querySelector(".map-cursor-ll");
    this.reset = root.querySelector(".map-reset");
    // Left pane: selection only (home: the region list; region: back button and Landing Time). Right pane: site data.
    this.side = root.querySelector(".map-side");
    this.filterBody = this.side.querySelector(".side-body");
    this.back = this.side.querySelector(".map-back");
    this.back.addEventListener("click", () => this.onHome());
    /** Whether the user has chosen a Landing Time on the region map; until then the sites aren't coloured. */
    this.picked = false;
    this.vb = { x: 0, y: 0, w: 1, h: 1 };
    this.mode = null;
    this.bindPanZoom();
    new ResizeObserver(() => this.refit()).observe(this.stage);
  }

  /* ---------- view box, pan, zoom ---------- */
  size() { const r = this.stage.getBoundingClientRect(); return [Math.max(1, r.width), Math.max(1, r.height)]; }
  fit(b, pad = 0.06) {
    const [W, H] = this.size();
    let w = (b.xmax - b.xmin) * (1 + 2 * pad), h = (b.ymax - b.ymin) * (1 + 2 * pad);
    if (w / h > W / H) h = (w * H) / W; else w = (h * W) / H;
    const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2;
    this.fitBox = b;
    this.setVB({ x: cx - w / 2, y: -cy - h / 2, w, h });
  }
  refit() {
    if (this.flight) { if (this.flight.done) this.setVB(this.flightVB()); return; } // hold the hand-off frame; the zoom re-measures each step
    if (this.fitBox && !this.userMoved) this.fit(this.fitBox); else this.setVB(this.vb);
  }
  setVB(vb) {
    const [W, H] = this.size();
    vb.h = (vb.w * H) / W; // keep aspect
    this.vb = vb;
    this.svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    if (this.mode === "home") this.labelGraticule();
    this.placeLabels();
    this.updateGridVisibility();
  }
  toMap(evt) {
    const r = this.svg.getBoundingClientRect();
    const x = this.vb.x + ((evt.clientX - r.left) / r.width) * this.vb.w;
    const sy = this.vb.y + ((evt.clientY - r.top) / r.height) * this.vb.h;
    return [x, -sy];
  }
  bindPanZoom() {
    let drag = null;
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.flight || this.mode === "home") return; // the home map is fixed
      const [mx, my] = this.toMap(e), f = Math.exp(e.deltaY * 0.0015);
      const vb = this.vb, w = Math.min(Math.max(vb.w * f, 2000), 700000);
      const k = w / vb.w;
      this.userMoved = true;
      this.setVB({ x: mx - (mx - vb.x) * k, y: -my - (-my - vb.y) * k, w, h: vb.h * k });
    }, { passive: false });
    this.svg.addEventListener("pointerdown", (e) => { if (this.flight) { drag = null; return; } drag = { x: e.clientX, y: e.clientY, vb: { ...this.vb }, moved: false, id: e.pointerId, region: this.hovered }; });
    this.svg.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && this.mode !== "home" && Math.hypot(dx, dy) > 4) { drag.moved = true; this.svg.setPointerCapture(drag.id); } // capture only once it is a drag
        if (drag.moved) {
          const r = this.svg.getBoundingClientRect(), s = drag.vb.w / r.width;
          this.userMoved = true;
          this.setVB({ ...drag.vb, x: drag.vb.x - dx * s, y: drag.vb.y - dy * s });
          return;
        }
      }
      this.showCursorLL(e);
      this.onMove && this.onMove(e);
    });
    this.svg.addEventListener("pointerup", (e) => {
      const was = drag; drag = null;
      if (was && !was.moved) this.onClick && this.onClick(e, was);
    });
    this.svg.addEventListener("pointerleave", () => { this.cursorLL.hidden = true; this.onLeave && this.onLeave(); });
    this.root.querySelector(".map-reset").addEventListener("click", () => { if (this.flight) return; this.userMoved = false; this.fit(this.fitBox); });
  }

  /** Latitude and longitude under the pointer, in the bottom-left corner of the map. */
  showCursorLL(e) {
    if (this.flight) { this.cursorLL.hidden = true; return; }
    const [x, y] = this.toMap(e);
    this.cursorLL.textContent = llText(x, y);
    this.cursorLL.hidden = false;
  }

  /* ---------- labels ---------- */
  placeLabels() {
    const [W, H] = this.size();
    for (const lab of this.labels.children) {
      const x = +lab.dataset.x, y = +lab.dataset.y;
      lab.style.left = `${((x - this.vb.x) / this.vb.w) * W}px`;
      lab.style.top = `${((-y - this.vb.y) / this.vb.h) * H}px`;
    }
  }

  /* ---------- home ---------- */
  showHome() {
    this.endFlight();
    this.mode = "home";
    this.userMoved = false;
    this.root.classList.add("home");
    this.card.hidden = true; // the home page has no site to show data for
    this.back.hidden = true;
    this.svg.replaceChildren();
    this.labels.replaceChildren();
    this.svg.setAttribute("aria-label", "Map of the lunar south pole with the nine Artemis III candidate regions");
    const h = this.homeBasemap, [x0, y0, x1, y1] = h.extent_m;
    svgEl("image", { href: h.href, x: x0, y: -y1, width: x1 - x0, height: y1 - y0, preserveAspectRatio: "none", class: "map-img" }, this.svg);
    const all = this.regions.map((r) => bbox(r.xy));
    const box = { xmin: Math.min(...all.map((b) => b.xmin)) - 60000, // room for the "Peak near Cabeus B" label
       xmax: Math.max(...all.map((b) => b.xmax)) + 25000, ymin: Math.min(...all.map((b) => b.ymin)) - 15000, ymax: Math.max(...all.map((b) => b.ymax)) + 15000 };
    // Graticule: parallels and meridians, each a light dashed line over a dark halo so it reads on any terrain.
    // Their labels are placed by labelGraticule() at the edges of what is on screen.
    const g = svgEl("g", { class: "graticule" }, this.svg);
    const line = (tag, attrs, cls) => { svgEl(tag, { ...attrs, class: `halo ${cls}` }, g); svgEl(tag, { ...attrs, class: `ln ${cls}` }, g); };
    for (const lat of LAT_RINGS) line("circle", { cx: 0, cy: 0, r: 2 * 1737400 * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360) }, "");
    for (let lon = 0; lon < 360; lon += LON_STEP) {
      const a = (lon * Math.PI) / 180, r = 400000;
      line("line", { x1: 0, y1: 0, x2: r * Math.sin(a), y2: -r * Math.cos(a) }, lon % 90 ? "minor" : "");
    }
    svgEl("circle", { cx: 0, cy: 0, r: 2500, class: "pole" }, this.svg);
    this.addLabel({ x: 0, y: -9000, text: "South Pole · 90° S", cls: "pole-label", a: "middle" });

    this.polys = {};
    for (const r of this.regions) {
      const pts = r.xy.map(([x, y]) => `${x},${-y}`).join(" ");
      const poly = svgEl("polygon", { points: pts, class: "region", "data-id": r.id, tabindex: 0, role: "button", "aria-label": `Open ${r.name}` }, this.svg);
      this.polys[r.id] = poly;
      const L = LABELS[r.id] || { x: bbox(r.xy).xmin - 3000, y: (bbox(r.xy).ymin + bbox(r.xy).ymax) / 2, a: "end" };
      const lab = this.addLabel({ x: L.x, y: L.y, text: r.name, cls: "region-label", a: L.a, id: r.id });
      lab.addEventListener("pointerenter", () => this.hover(r.id));
      lab.addEventListener("pointerleave", () => this.hover(null));
      lab.addEventListener("click", () => this.onRegion(r.id));
      poly.addEventListener("pointerenter", () => this.hover(r.id));
      poly.addEventListener("pointerleave", () => this.hover(null));
      poly.addEventListener("keydown", (e) => { if (e.key === "Enter") this.onRegion(r.id); });
    }
    this.onMove = null;
    this.onLeave = () => this.hover(null);
    this.onClick = (e, press) => { const id = (press && press.region) || this.hovered; if (id) this.onRegion(id); };

    this.fit(box, 0.04);
    this.zoomHint.hidden = true;
    this.reset.hidden = true; // nothing to reset: the home map doesn't zoom or pan
    this.setCrumbs([{ text: "Lunar south pole" }]);
    this.renderHomeCard();
  }
  /** Latitude labels on each ring and longitude labels where each meridian leaves the visible map (home only). */
  labelGraticule() {
    for (const l of this.labels.querySelectorAll(".lat-label, .lon-label")) l.remove();
    const [W] = this.size(), mpp = this.vb.w / W, inset = 22 * mpp;
    const box = { xmin: this.vb.x + inset * 2.4, xmax: this.vb.x + this.vb.w - inset * 2.4, ymin: -(this.vb.y + this.vb.h) + inset, ymax: -this.vb.y - inset };
    const inBox = (x, y) => x > box.xmin && x < box.xmax && y > box.ymin && y < box.ymax;
    const rad = (d) => (d * Math.PI) / 180;
    for (const lat of LAT_RINGS) {
      const rho = 2 * 1737400 * Math.tan(Math.PI / 4 + rad(lat) / 2);
      // on the first bearing between meridians (15° off one) that is on screen
      const at = [225, 135, 315, 45, 255, 105, 195, 165].map((d) => [rho * Math.sin(rad(d)), rho * Math.cos(rad(d))]).find(([x, y]) => inBox(x, y));
      if (at) this.addLabel({ x: at[0], y: at[1], text: `${-lat}° S`, cls: "lat-label", a: "middle" });
    }
    for (let lon = 0; lon < 360; lon += LON_STEP) {
      const dx = Math.sin(rad(lon)), dy = Math.cos(rad(lon));
      const tx = dx > 1e-9 ? box.xmax / dx : dx < -1e-9 ? box.xmin / dx : Infinity;
      const ty = dy > 1e-9 ? box.ymax / dy : dy < -1e-9 ? box.ymin / dy : Infinity;
      const t = Math.min(tx, ty);
      if (t > 0 && Number.isFinite(t)) this.addLabel({ x: t * dx, y: t * dy, text: lonText(lon), cls: `lon-label${lon % 90 ? " minor" : ""}`, a: "middle" });
    }
  }
  addLabel({ x, y, text, cls, a, id }) {
    const el = document.createElement(id ? "button" : "span");
    el.className = `map-label ${cls} anchor-${a}`;
    el.textContent = text;
    el.dataset.x = x; el.dataset.y = y;
    if (id) { el.type = "button"; el.dataset.id = id; }
    this.labels.appendChild(el);
    this.placeLabels();
    return el;
  }
  hover(id) {
    this.hovered = id;
    for (const [rid, p] of Object.entries(this.polys || {})) p.classList.toggle("hover", rid === id);
    for (const l of this.labels.querySelectorAll(".region-label")) l.classList.toggle("hover", l.dataset.id === id);
    for (const li of this.filterBody.querySelectorAll("[data-id]")) li.classList.toggle("hover", li.dataset.id === id);
  }
  renderHomeCard() {
    this.filterBody.innerHTML = `
      <h2>Pick a Landing Region</h2>
      <p class="hint">Pick one of the nine Artemis III regions to see its best Landing Sites.</p>
      <ol class="region-list">${this.regions.map((r) => {
        const [w, h] = sizeKm(r);
        return `<li><button type="button" data-id="${r.id}"><span>${r.name}${r.hasSiteData ? "" : ' <em class="soon">coming soon</em>'}</span><small>${w.toFixed(0)} × ${h.toFixed(0)} km · ${siteGrid(r).count.toLocaleString()} sites</small></button></li>`;
      }).join("")}</ol>`;
    for (const b of this.filterBody.querySelectorAll("button[data-id]")) {
      b.addEventListener("pointerenter", () => this.hover(b.dataset.id));
      b.addEventListener("pointerleave", () => this.hover(null));
      b.addEventListener("click", () => this.onRegion(b.dataset.id));
    }
  }

  /* ---------- region ---------- */
  async showRegion(id, selectedCell = null) {
    const r = this.regions.find((x) => x.id === id);
    if (!r) return this.onHome();
    this.endFlight();
    this.mode = "region";
    this.region = r;
    this.reset.hidden = false;
    this.root.classList.remove("home");
    this.card.hidden = false;
    this.back.hidden = false;
    this.userMoved = false;
    this.polys = null;
    this.svg.replaceChildren();
    this.labels.replaceChildren();
    this.svg.setAttribute("aria-label", `Map of ${r.name} with its 200 m landing site grid`);
    this.teamSiteData = null;
    const bm = await this.regionBasemap(r);
    if (this.region !== r) return; // another region was opened meanwhile
    const [left, bottom, right, top] = bm.extent_m, bw = right - left, bh = top - bottom;
    svgEl("image", { href: bm.href, x: left, y: -top, width: bw, height: bh, preserveAspectRatio: "none", class: "map-img" }, this.svg);

    // Diagonal hatch for too-steep sites (map metres: two stripes per 200 m site).
    const hatch = svgEl("pattern", { id: "steep-hatch", class: "steep-hatch", patternUnits: "userSpaceOnUse", width: GRID_M / 2, height: GRID_M / 2, patternTransform: "rotate(45)" }, svgEl("defs", {}, this.svg));
    svgEl("line", { x1: GRID_M / 4, y1: 0, x2: GRID_M / 4, y2: GRID_M / 2 }, hatch);

    const grid = (this.grid = siteGrid(r)), e = grid.extent;
    // dim everything outside the region
    const outer = `M${left},${-top}h${bw}v${bh}h${-bw}z`;
    const inner = `M${e.xmin},${-e.ymax}H${e.xmax}V${-e.ymin}H${e.xmin}z`;
    svgEl("path", { d: outer + inner, class: "mask clears-on-flight", "fill-rule": "evenodd" }, this.svg);
    // grid lines on the 200 m cell edges
    let d = "";
    for (let x = e.xmin; x <= e.xmax + 1; x += GRID_M) d += `M${x},${-e.ymax}V${-e.ymin}`;
    for (let y = e.ymin; y <= e.ymax + 1; y += GRID_M) d += `M${e.xmin},${-y}H${e.xmax}`;
    this.gridPath = svgEl("path", { d, class: "grid clears-on-flight" }, this.svg);
    svgEl("polygon", { points: r.xy.map(([x, y]) => `${x},${-y}`).join(" "), class: "region-outline clears-on-flight" }, this.svg);
    this.hoverRect = svgEl("rect", { width: GRID_M, height: GRID_M, class: "cell-hover", visibility: "hidden" }, this.svg);
    this.selRect = svgEl("rect", { width: GRID_M, height: GRID_M, class: "cell-selected", visibility: "hidden" }, this.svg);
    this.heatLayer = svgEl("g", { class: "heat-cells clears-on-flight" }, this.svg);
    this.steepLayer = svgEl("g", { class: "steep-cells clears-on-flight" }, this.svg);
    this.topLayer = svgEl("g", { class: "top-cells clears-on-flight" }, this.svg);
    this.rankData = null;
    this.topIds = new Set();

    this.renderFilter(r, grid);
    this.renderRegionCard(r, grid, bm);
    this.fit({ xmin: e.xmin, xmax: e.xmax, ymin: e.ymin, ymax: e.ymax }, 0.05);
    this.setCrumbs([{ text: "Lunar south pole", go: () => this.onHome() }, { text: r.name }], { back: false });
    if (selectedCell) this.markCell(grid.byId(selectedCell), this.selRect);

    this.dem = null;
    this.demFor(id).then((dem) => { if (this.region === r) { this.dem = dem; this.renderCell(this.lastCell); } }).catch((err) => console.error(err));
    if (r.hasSiteData) this.teamSites(id).then((t) => { if (this.region === r) { this.teamSiteData = t; this.renderCell(this.lastCell); } }).catch((err) => console.error(err));
    if (r.hasSiteData && this.picked) this.loadTopTen(r, grid);

    this.onMove = (ev) => {
      if (this.flying) return;
      const [x, y] = this.toMap(ev), cell = grid.cellAt(x, y);
      this.markCell(cell, this.hoverRect);
      this.svg.style.cursor = cell ? "pointer" : "";
      if (cell) this.renderCell(cell);
    };
    this.onLeave = () => this.markCell(null, this.hoverRect);
    this.onClick = (ev) => {
      if (this.flying) return;
      const [x, y] = this.toMap(ev), cell = grid.cellAt(x, y);
      if (cell) { this.markCell(cell, this.selRect); this.onSite(r.id, cell.id); }
    };
  }
  markCell(cell, rect) {
    if (!cell) { rect.setAttribute("visibility", "hidden"); return; }
    rect.setAttribute("x", cell.x - GRID_M / 2);
    rect.setAttribute("y", -(cell.y + GRID_M / 2));
    rect.setAttribute("visibility", "visible");
  }
  updateGridVisibility() {
    if (this.mode !== "region" || !this.gridPath) return;
    const [W] = this.size(), cellPx = (GRID_M / this.vb.w) * W;
    this.gridPath.style.opacity = cellPx < 4 ? 0 : Math.min(0.55, (cellPx - 4) / 10 + 0.15);
    this.zoomHint.hidden = cellPx >= 4;
  }
  renderRegionCard(r, grid, bm) {
    const [w, h] = sizeKm(r);
    this.card.innerHTML = `
      <h2>${r.name} <span class="sub">${w.toFixed(0)} × ${h.toFixed(0)} km · ${grid.count.toLocaleString()} sites</span></h2>
      <dl class="cell-read" id="cellRead">
        <dt>Site</dt><dd data-k="id" class="placeholder">hover a square</dd>
        <dt>Elevation</dt><dd data-k="h">—</dd>
        <dt data-k="sl">Slope</dt><dd data-k="s">—</dd>
        ${r.hasSiteData ? `<dt title="${ROBUSTNESS_TITLE}">Timing</dt><dd data-k="robust">—</dd><dt title="${WALKABLE_TITLE}">EVA walk</dt><dd data-k="walk">—</dd><dt class="wide">Rank</dt><dd class="wide" data-k="rank">—</dd>` : ""}
      </dl>
      ${r.hasSiteData ? `
      <p class="pick-prompt"${this.picked ? " hidden" : ""}>Choose a landing <b>date</b> and <b>time</b> in the panel on the left to colour the sites by Sun and Earth coverage and list the top 10.</p>
      <section class="map-top"${this.picked ? "" : " hidden"}>
        <div class="legend">
          <span title="The Sun and Earth stay in view for the whole 7-day stay"><i style="background:${rgb(FULL_HIGH)}"></i> In view all week</span>
          <span title="The Sun or Earth is blocked by terrain for part of the stay"><i style="background:${rgb(PARTIAL_HIGH)}"></i><i style="background:${rgb(PARTIAL_LOW)}"></i> Blocked at times</span>
          <span><i class="outlined"></i> Top 10</span>
          <span><i class="steep"></i> Too steep</span>
        </div>
        <div class="top-title"><h3>Top 10 sites</h3></div>
        <p class="hint top-status"></p>
        <ol class="top-list"></ol>
      </section>` : ""}`;
  }

  /* ---------- left pane on the region map: selection criteria (Landing date and time, slope limit) ---------- */
  /** Show the coverage colours and the top 10 for the chosen Landing Time, or clear them (on = false). */
  setPicked(on, r, grid) {
    this.picked = on;
    this.card.querySelector(".pick-prompt")?.toggleAttribute("hidden", on);
    this.card.querySelector(".map-top")?.toggleAttribute("hidden", !on);
    if (on) { this.loadTopTen(r, grid); return; }
    this.topToken = (this.topToken || 0) + 1; // drop a ranking still in flight
    this.rankData = null;
    this.topIds = new Set();
    this.topLayer.replaceChildren();
    this.heatLayer.replaceChildren();
    this.steepLayer.replaceChildren();
    for (const l of this.labels.querySelectorAll(".top-label")) l.remove();
    this.renderCell(this.lastCell);
  }
  renderFilter(r, grid) {
    this.dark = null;
    if (!r.hasSiteData) { this.filterBody.innerHTML = `<p class="filter-note">Landing Times for ${r.name} are coming soon.</p>`; return; }
    const t = new Date(this.getLanding()), pad = (n) => String(n).padStart(2, "0");
    this.calMonth = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1);
    this.calView = "days"; // "days" → click the title → "months" → click again → "years"
    this.filterBody.innerHTML = `
      <h2>Landing Time</h2>
      <p class="filter-note">Pick a day, then type a time (UTC). The crew stays 7 days.</p>
      <div class="cal" role="group" aria-label="Landing date">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-dir="-1">‹</button>
          <button type="button" class="cal-title" aria-live="polite"></button>
          <button type="button" class="cal-nav" data-dir="1">›</button>
        </div>
        <div class="cal-grid"></div>
      </div>
      <div class="cal-key">
        <span><i class="k-dark"></i> Dark all day: no sunlight anywhere in the region</span>
        <span class="cal-status">Checking for dark days…</span>
      </div>
      <div class="time-pick">
        <label>Hour <input class="t-hour" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="Landing hour, 00 to 23 (UTC)" placeholder="hh"></label>
        <span class="colon">:</span>
        <label>Minute <input class="t-min" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="Landing minute, 00 to 59 (UTC)" placeholder="mm"></label>
        <span class="utc">UTC</span>
      </div>
      <p class="filter-note time-note">Minutes round to the nearest 10. ↑ / ↓ step the value.</p>
      <p class="filter-picked" aria-live="polite"></p>
      <p class="dark-warn" role="note" hidden></p>
      <button type="button" class="filter-clear">Clear selection</button>
      <h2 class="side-h">Landing Slope</h2>
      ${slopeLimitHtml(this.getSlopeLimit())}
      <p class="filter-note">Sites at or over this slope are shaded and left out of the top 10.</p>`;
    const limit = this.filterBody.querySelector(".slope-limit select");
    limit.addEventListener("change", () => { this.setSlopeLimit(slopeLimitOf(limit)); if (this.picked) this.loadTopTen(r, grid); });

    // Typed hour and minute: digits only; on Enter, blur or ↑/↓ the value is clamped (minutes to the 10-minute grid).
    const hour = this.filterBody.querySelector(".t-hour"), min = this.filterBody.querySelector(".t-min");
    // Until a Landing Time is chosen the hour and minute are blank (null); picking a day with no time typed lands at 00:00.
    const time = this.picked ? { h: t.getUTCHours(), m: Math.floor(t.getUTCMinutes() / 10) * 10 } : { h: null, m: null };
    const show = () => { hour.value = time.h === null ? "" : pad(time.h); min.value = time.m === null ? "" : pad(time.m); };
    show();
    const dayOf = (ms) => ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS);
    this.pickDay = (day) => {
      time.h ??= 0; time.m ??= 0;
      show();
      this.setLanding(day + (time.h * 60 + time.m) * 60000);
      this.picked = true; // before drawing, so the calendar marks the chosen day
      this.drawCalendar();
      this.setPicked(true, r, grid);
    };
    const commit = (h, m) => {
      const nh = h === null ? null : Math.min(23, Math.max(0, h)), nm = m === null ? null : Math.min(50, Math.max(0, Math.round(m / 10) * 10));
      const changed = nh !== time.h || nm !== time.m;
      Object.assign(time, { h: nh, m: nm });
      show();
      if (changed && this.picked) this.pickDay(dayOf(this.getLanding()));
    };
    const read = (input, fallback) => (input.value.trim() === "" ? fallback : Number(input.value));
    for (const [input, isHour] of [[hour, true], [min, false]]) {
      input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 2); });
      input.addEventListener("focus", () => input.select());
      input.addEventListener("change", () => commit(read(hour, time.h), read(min, time.m)));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(read(hour, time.h), read(min, time.m)); input.select(); return; }
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const d = e.key === "ArrowUp" ? 1 : -1;
        // wrap within the day: 23 → 00, 50 → 00; a blank field steps to 00
        if (isHour) commit(time.h === null ? 0 : (time.h + d + 24) % 24, time.m);
        else commit(time.h, time.m === null ? 0 : (time.m + d * 10 + 60) % 60);
        input.select();
      });
    }

    this.filterBody.querySelector(".cal-title").addEventListener("click", () => {
      this.calView = this.calView === "days" ? "months" : "years";
      this.drawCalendar();
    });
    for (const b of this.filterBody.querySelectorAll(".cal-nav")) b.addEventListener("click", () => {
      const d = new Date(this.calMonth), k = Number(b.dataset.dir);
      this.calMonth = this.calView === "days" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) : Date.UTC(d.getUTCFullYear() + k, d.getUTCMonth(), 1);
      this.drawCalendar();
    });
    this.filterBody.querySelector(".filter-clear").addEventListener("click", () => {
      time.h = time.m = null;
      show();
      this.setPicked(false, r, grid);
      this.drawCalendar();
    });
    this.drawCalendar();
    const status = (text) => { const st = this.filterBody.querySelector(".cal-status"); if (st) st.textContent = text; };
    darkDays(r.id).then((days) => {
      if (this.region !== r) return;
      this.dark = new Set(days);
      status(days.length ? `${days.length} dark ${days.length === 1 ? "day" : "days"} in the year, shown in black` : "No fully dark days in the year");
      this.drawCalendar();
    }).catch((err) => { console.error(err); status("Couldn't check for dark days"); });
  }
  /**
   * The calendar, in one of three views like a desktop clock: days of a month, the months of a year, or the years.
   * Clicking the title goes up a level; picking a month or year goes back down. Days outside the Supported Span
   * can't be picked; fully dark days are black but can be, with a warning.
   */
  drawCalendar() {
    const gridEl = this.filterBody.querySelector(".cal-grid");
    if (!gridEl) return;
    const m = new Date(this.calMonth), y = m.getUTCFullYear(), mo = m.getUTCMonth();
    const s0 = new Date(SPAN_START), s1 = new Date(SPAN_END - 1);
    const firstMonth = Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth(), 1), lastMonth = Date.UTC(s1.getUTCFullYear(), s1.getUTCMonth(), 1);
    const fmt = (ms, o) => new Date(ms).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
    const chosen = this.picked ? new Date(this.getLanding()) : null;
    const chosenDay = chosen && Date.UTC(chosen.getUTCFullYear(), chosen.getUTCMonth(), chosen.getUTCDate());
    const title = this.filterBody.querySelector(".cal-title"), [prev, next] = this.filterBody.querySelectorAll(".cal-nav");
    gridEl.className = `cal-grid view-${this.calView}`;
    let html = "";
    if (this.calView === "days") {
      title.textContent = fmt(this.calMonth, { month: "long", year: "numeric" });
      title.title = "Show the months";
      prev.disabled = this.calMonth <= firstMonth;
      next.disabled = this.calMonth >= lastMonth;
      prev.ariaLabel = "Previous month"; next.ariaLabel = "Next month";
      const lead = (m.getUTCDay() + 6) % 7, nDays = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      html = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => `<span class="cal-dow">${d}</span>`).join("") + "<span></span>".repeat(lead);
      for (let d = 1; d <= nDays; d++) {
        const day = Date.UTC(y, mo, d), out = day < SPAN_START || day >= SPAN_END, dark = !out && !!this.dark?.has(day), sel = day === chosenDay;
        const why = out ? "Outside the supported year" : dark ? "Dark all day: no sunlight anywhere in the region (you can still pick it)" : "";
        const label = fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        html += `<button type="button" class="cal-day${dark ? " dark" : ""}${sel ? " sel" : ""}" data-day="${day}"${out ? " disabled" : ""}`
          + ` aria-label="${label}${why ? `, ${why}` : ""}" title="${why || label}" aria-pressed="${sel}">${d}</button>`;
      }
    } else if (this.calView === "months") {
      title.textContent = String(y);
      title.title = "Show the years";
      prev.disabled = y <= s0.getUTCFullYear();
      next.disabled = y >= s1.getUTCFullYear();
      prev.ariaLabel = "Previous year"; next.ariaLabel = "Next year";
      for (let k = 0; k < 12; k++) {
        const ms = Date.UTC(y, k, 1), out = ms < firstMonth || ms > lastMonth;
        const sel = chosen && chosen.getUTCFullYear() === y && chosen.getUTCMonth() === k;
        html += `<button type="button" class="cal-cell${sel ? " sel" : ""}${ms === this.calMonth ? " here" : ""}" data-month="${ms}"${out ? " disabled" : ""}`
          + ` aria-label="${fmt(ms, { month: "long", year: "numeric" })}${out ? ", outside the supported year" : ""}">${fmt(ms, { month: "short" })}</button>`;
      }
    } else {
      const y0 = s0.getUTCFullYear(), y1 = s1.getUTCFullYear();
      title.textContent = `${y0} – ${y1}`;
      title.title = "";
      prev.disabled = next.disabled = true;
      prev.ariaLabel = "Previous years"; next.ariaLabel = "Next years";
      for (let yy = y0; yy <= y1; yy++) {
        const sel = chosen && chosen.getUTCFullYear() === yy;
        html += `<button type="button" class="cal-cell${sel ? " sel" : ""}${yy === y ? " here" : ""}" data-year="${yy}">${yy}</button>`;
      }
    }
    title.disabled = this.calView === "years";
    gridEl.innerHTML = html;
    for (const b of gridEl.querySelectorAll(".cal-day:not([disabled])")) b.addEventListener("click", () => this.pickDay(Number(b.dataset.day)));
    for (const b of gridEl.querySelectorAll("[data-month]:not([disabled])")) b.addEventListener("click", () => { this.calMonth = Number(b.dataset.month); this.calView = "days"; this.drawCalendar(); });
    for (const b of gridEl.querySelectorAll("[data-year]")) b.addEventListener("click", () => {
      // keep the month if it is in that year's part of the span, else the nearest month that is
      const ms = Date.UTC(Number(b.dataset.year), mo, 1);
      this.calMonth = Math.min(lastMonth, Math.max(firstMonth, ms));
      this.calView = "months";
      this.drawCalendar();
    });
    this.filterBody.querySelector(".filter-picked").innerHTML = chosen
      ? `Landing <b>${fmt(chosenDay, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b> at <b>${formatUtc(this.getLanding()).slice(11, 16)} UTC</b>`
      : "No date chosen yet";
    this.filterBody.querySelector(".filter-clear").disabled = !this.picked;
    const warn = this.filterBody.querySelector(".dark-warn");
    warn.hidden = !(chosen && this.dark?.has(chosenDay));
    if (!warn.hidden) warn.innerHTML = `<b>Warning: dark day.</b> On this day the Sun stays below the local terrain horizon (Sun Clearance ≤ 0°) `
      + `at every site in the region, all day: the whole region is in shadow. A crew landing now would start with no direct sunlight `
      + `for solar power or lighting until the Sun clears the horizon. Check the coverage colours and the top 10 for later in the stay.`;
  }

  /** Rank every site for the shared Landing Time and draw the top 10 (team science port, in a worker). */
  async loadTopTen(r, grid) {
    const token = (this.topToken = (this.topToken || 0) + 1), landing = this.getLanding();
    const status = this.card.querySelector(".top-status"), list = this.card.querySelector(".map-top .top-list");
    this.rankData = null;
    this.topIds = new Set();
    this.topLayer.replaceChildren();
    this.heatLayer.replaceChildren();
    this.steepLayer.replaceChildren();
    for (const l of this.labels.querySelectorAll(".top-label")) l.remove();
    if (status) status.textContent = "Scoring sites…";
    if (list) list.replaceChildren();
    try {
      const [res, team] = await Promise.all([this.ranking(r.id, landing, (f) => {
        if (token === this.topToken && status) status.textContent = `Scoring sites… ${Math.round(f * 100)} %`;
      }), this.teamSites(r.id).catch(() => null)]);
      if (token !== this.topToken || this.region !== r) return;
      this.rankData = res;
      const limitDeg = this.getSlopeLimit(), top = topUnderSlope(res, team, limitDeg);
      this.topIds = new Set(top.map((e) => e.site_id));
      // Coverage heatmap: every site coloured by coverage, one path per colour.
      const byColor = new Map(), h = GRID_M / 2;
      for (const e of res.doc.sites) {
        const cell = grid.byId(e.site_id);
        if (!cell) continue;
        const c = coverageColor(e);
        byColor.set(c, (byColor.get(c) || "") + `M${cell.x - h},${-(cell.y + h)}h${GRID_M}v${GRID_M}h${-GRID_M}z`);
      }
      for (const [c, d] of byColor) svgEl("path", { d, fill: c, class: "heat" }, this.heatLayer);
      // Shade the sites at or over the slope limit.
      const steep = (e) => !underSlopeLimit(team?.slopeOf(e.site_id), limitDeg);
      const hasSlope = !!team?.region.landingSlopeDeg;
      if (hasSlope && limitDeg !== null) {
        let d = "";
        for (const e of res.doc.sites) {
          const cell = steep(e) && grid.byId(e.site_id);
          if (cell) d += `M${cell.x - h},${-(cell.y + h)}h${GRID_M}v${GRID_M}h${-GRID_M}z`;
        }
        if (d) svgEl("path", { d, class: "steep" }, this.steepLayer);
      }
      const nFull = res.doc.sites.filter((x) => x.coverage === "full").length;
      const nFullFlat = hasSlope && limitDeg !== null ? res.doc.sites.filter((x) => x.coverage === "full" && !steep(x)).length : null;
      const total = res.doc.sites.length.toLocaleString();
      if (status) status.textContent = (!nFull
        ? "No site keeps the Sun and Earth in view all week at this time. Try another Landing Time."
        : nFullFlat === null ? `${nFull.toLocaleString()} of ${total} sites keep the Sun and Earth in view all week.`
        : nFullFlat ? `${nFullFlat.toLocaleString()} of ${total} sites keep the Sun and Earth in view all week and are flat enough.`
        : `${nFull.toLocaleString()} sites keep the Sun and Earth in view all week, but none are flat enough.`)
        + (limitDeg !== null && !hasSlope ? " No slope data here yet." : "");
      top.forEach((e, i) => {
        const cell = grid.byId(e.site_id);
        if (!cell) return;
        svgEl("rect", { x: cell.x - GRID_M / 2, y: -(cell.y + GRID_M / 2), width: GRID_M, height: GRID_M, class: "top-cell", style: `fill:${coverageColor(e)};stroke:${coverageColor(e)}` }, this.topLayer);
        const lab = this.addLabel({ x: cell.x + GRID_M, y: cell.y + GRID_M, text: String(i + 1), cls: "top-label", a: "start", id: e.site_id });
        lab.addEventListener("click", () => this.onSite(r.id, e.site_id));
      });
      if (list) fillTopList(list, top, {
        team,
        onPick: (e) => this.onSite(r.id, e.site_id),
        onHover: (e) => { const cell = grid.byId(e.site_id); if (cell) { this.markCell(cell, this.hoverRect); this.renderCell(cell); } },
      });
      this.renderCell(this.lastCell);
    } catch (err) {
      if (token !== this.topToken) return;
      console.error(err);
      if (status) status.textContent = `Couldn't rank the sites: ${err.message}`;
    }
  }
  renderCell(cell) {
    this.lastCell = cell;
    if (!cell || this.mode !== "region") return;
    const set = (k, v) => { const n = this.card.querySelector(`[data-k="${k}"]`); if (n) n.textContent = v; };
    set("id", cell.id);
    this.card.querySelector('[data-k="id"]')?.classList.remove("placeholder");
    const teamH = this.teamSiteData ? this.teamSiteData.heightOf(cell.id) : undefined;
    const team = teamH !== undefined;
    if (team) set("h", `${Math.round(teamH).toLocaleString()} m`);
    const teamSlope = this.teamSiteData ? this.teamSiteData.slopeOf(cell.id) : undefined;
    if (teamSlope !== undefined) set("s", slopeLabel(teamSlope));
    const label = this.card.querySelector('[data-k="sl"]');
    if (label) label.title = teamSlope !== undefined ? SLOPE_TITLE : "Slope over 200 m";
    if (this.dem) {
      if (!team) set("h", `${Math.round(this.dem.at(cell.x, cell.y)).toLocaleString()} m`);
      if (teamSlope === undefined) set("s", `${this.dem.slope(cell.x, cell.y).toFixed(1)}°`);
    } else { if (!team) set("h", "loading…"); if (teamSlope === undefined) set("s", "loading…"); }
    if (this.teamSiteData) {
      set("robust", robustnessLabel(this.teamSiteData.robustnessOf(cell.id)));
      set("walk", walkableLabel(this.teamSiteData.walkableOf(cell.id)));
    }
    const e = this.rankData && this.rankData.byId.get(cell.id);
    set("rank", e ? `${e.rank.toLocaleString()} of ${this.rankData.doc.sites.length.toLocaleString()}${this.topIds.has(cell.id) ? " · top 10" : ""} · ${coverageLabel(e)}` : !this.region?.hasSiteData ? "—" : this.picked ? "scoring…" : "pick a date and time");
  }

  /* ---------- fly-in to a Landing Site (hand-off to the 3D view) ---------- */
  get flying() { return !!this.flight; }
  /**
   * Zoom the region map onto one Landing Site, fading the other sites, the heatmap and the labels, and blacking out
   * the map outside the sizeM square the 3D view will show. The last frame puts that square where the 3D view's
   * first (overhead) frame will draw it: frame() gives that canvas's viewport rect. Resolves when the zoom ends;
   * the map then holds that frame (pan and zoom off) until fadeOut(), abortFlight() or the next showHome/showRegion.
   */
  flyTo(cell, sizeM, frame) {
    if (this.mode !== "region" || !cell) return Promise.resolve();
    this.endFlight();
    const flight = (this.flight = { cell, sizeM, frame, done: false });
    this.markCell(null, this.hoverRect);
    this.markCell(cell, this.selRect);
    this.svg.style.cursor = "";
    this.root.classList.add("flying");
    const half = sizeM / 2, big = 1e7;
    flight.mask = svgEl("path", {
      d: `M${-big},${-big}h${2 * big}v${2 * big}h${-2 * big}z M${cell.x - half},${-(cell.y + half)}h${sizeM}v${sizeM}h${-sizeM}z`,
      "fill-rule": "evenodd", class: "flight-mask",
    }, this.svg);
    this.svg.appendChild(this.selRect); // keep the chosen site on top
    const from = { ...this.vb }, ms = prefersReducedMotion() ? 0 : 900;
    const fx = (cell.x - from.x) / from.w, fy = (-cell.y - from.y) / from.h; // the site's place on screen, as a share of the stage
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (this.flight !== flight) return resolve();
        const t = ms ? Math.min(1, (now - t0) / ms) : 1, k = easeInOutCubic(t);
        const to = this.flightVB(), [W, H] = this.size();
        // Zoom in log space so the scale change feels even; the site glides from where it was to its final spot.
        const w = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * k), h = (w * H) / W;
        const tx = (cell.x - to.x) / to.w, ty = (-cell.y - to.y) / ((to.w * H) / W);
        this.setVB({ x: cell.x - (fx + (tx - fx) * k) * w, y: -cell.y - (fy + (ty - fy) * k) * h, w });
        flight.mask.style.opacity = String(phase(k, 0.35, 0.55));
        if (t < 1) { flight.raf = requestAnimationFrame(step); return; }
        flight.done = true;
        resolve();
      };
      flight.raf = requestAnimationFrame(step);
    });
  }
  /** View box that draws the flight's slice square where the 3D view will draw it (falls back to the stage centre). */
  flightVB() {
    const { cell, sizeM, frame } = this.flight, st = this.stage.getBoundingClientRect(), [W] = this.size();
    let f = frame && frame();
    if (!f || f.width < 1 || f.height < 1) f = st;
    const mpp = (sizeM * SLICE_FIT_MARGIN) / Math.min(f.width, f.height); // map metres per screen pixel
    const cx = f.left + f.width / 2 - st.left, cy = f.top + f.height / 2 - st.top;
    return { x: cell.x - cx * mpp, y: -cell.y - cy * mpp, w: W * mpp };
  }
  /** Small notice over the held map frame (loading, or an error that clears itself). */
  showNotice(text, { error = false } = {}) {
    let n = this.stage.querySelector(".flight-notice");
    if (!n) n = Object.assign(document.createElement("p"), { className: "flight-notice" });
    n.textContent = text;
    n.classList.toggle("error", error);
    this.stage.appendChild(n);
    clearTimeout(this.noticeTimer);
    if (error) this.noticeTimer = setTimeout(() => n.remove(), 6000);
  }
  /** Cross-fade the held map frame out over the 3D view, then hide the map. */
  fadeOut() {
    if (!this.flight) return;
    this.stage.querySelector(".flight-notice")?.remove();
    this.root.classList.add("leaving");
    this.flight.fadeTimer = setTimeout(() => { this.root.hidden = true; this.endFlight(); }, prefersReducedMotion() ? 0 : 320);
  }
  /** The site view couldn't open: give the map back, zoomed where it is, with the reason. */
  abortFlight(message) {
    this.endFlight();
    this.userMoved = true; // stay on the zoomed frame rather than snapping back to the whole region
    this.showNotice(message, { error: true });
  }
  endFlight() {
    const f = this.flight;
    this.flight = null;
    if (f) { cancelAnimationFrame(f.raf); clearTimeout(f.fadeTimer); f.mask.remove(); }
    this.root.classList.remove("flying", "leaving");
    this.stage.querySelector(".flight-notice:not(.error)")?.remove();
  }

  setCrumbs(items, opts) { setBreadcrumbs(this.crumbs, items, opts); }
}

/**
 * Fill a breadcrumb <nav> with items [{ text, go? }] (the last is the current page). Below the top level it starts
 * with a "← <parent>" button, so going back up is one obvious click.
 */
export function setBreadcrumbs(nav, items, { back: withBack = true } = {}) {
  const parent = items.length > 1 ? items[items.length - 2] : null;
  const back = withBack && parent && parent.go
    ? [Object.assign(document.createElement("button"), { type: "button", className: "back-btn", textContent: `← ${parent.text === "Lunar south pole" ? "All regions" : parent.text}`, onclick: parent.go, title: "Back (Esc)" })]
    : [];
  nav.replaceChildren(...back, ...items.flatMap((it, i) => {
    const n = it.go ? Object.assign(document.createElement("button"), { type: "button", textContent: it.text, onclick: it.go }) : Object.assign(document.createElement("span"), { textContent: it.text });
    return i ? [Object.assign(document.createElement("span"), { className: "sep", textContent: "›" }), n] : [n];
  }));
}

export { xyToLL };
