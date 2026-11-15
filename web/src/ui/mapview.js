// SPDX-License-Identifier: MIT
// 2D south polar map: the home view (all nine Artemis III regions) and the region view (200 m site grid).
// Map coordinates are polar stereographic metres (src/polar.js); SVG y is the negative of map y.
// Hillshades, outlines and site heights come from the team's site-data (src/teamdata.js).

import { GRID_M, siteGrid, bbox, xyToLL } from "./polar.js";
import { sizeKm } from "./regions.js";
import { prefersReducedMotion, easeInOutCubic, phase, SLICE_FIT_MARGIN } from "./transition.js";
import { fillTopList, slopeLimitHtml, slopeLimitOf } from "./toplist.js";
import { formatUtc, coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE, slopeLabel, underSlopeLimit, SLOPE_TITLE, walkableLabel, WALKABLE_TITLE, topUnderSlope, SPAN_START, SPAN_END, STEP_MS, FULL_HIGH, PARTIAL_HIGH, PARTIAL_LOW, rgb } from "./ranking.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmtLat = (v) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? "E" : "W"}`;

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
const LAT_RINGS = [-80, -85, -88]; // dashed parallels for orientation

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
      if (this.flight) return;
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
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; this.svg.setPointerCapture(drag.id); } // capture only once it is a drag
        if (drag.moved) {
          const r = this.svg.getBoundingClientRect(), s = drag.vb.w / r.width;
          this.userMoved = true;
          this.setVB({ ...drag.vb, x: drag.vb.x - dx * s, y: drag.vb.y - dy * s });
          return;
        }
      }
      this.onMove && this.onMove(e);
    });
    this.svg.addEventListener("pointerup", (e) => {
      const was = drag; drag = null;
      if (was && !was.moved) this.onClick && this.onClick(e, was);
    });
    this.svg.addEventListener("pointerleave", () => this.onLeave && this.onLeave());
    this.root.querySelector(".map-reset").addEventListener("click", () => { if (this.flight) return; this.userMoved = false; this.fit(this.fitBox); });
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
    this.svg.replaceChildren();
    this.labels.replaceChildren();
    this.svg.setAttribute("aria-label", "Map of the lunar south pole with the nine Artemis III candidate regions");
    const h = this.homeBasemap, [x0, y0, x1, y1] = h.extent_m;
    svgEl("image", { href: h.href, x: x0, y: -y1, width: x1 - x0, height: y1 - y0, preserveAspectRatio: "none", class: "map-img" }, this.svg);
    const g = svgEl("g", { class: "graticule" }, this.svg);
    for (const lat of LAT_RINGS) {
      const rho = 2 * 1737400 * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360);
      svgEl("circle", { cx: 0, cy: 0, r: rho }, g);
      this.addLabel({ x: rho * Math.SQRT1_2, y: -rho * Math.SQRT1_2, text: `${-lat}° S`, cls: "lat-label", a: "start" });
    }
    for (const lon of [0, 90, 180, 270]) {
      const a = (lon * Math.PI) / 180, r = 304000;
      svgEl("line", { x1: 0, y1: 0, x2: r * Math.sin(a), y2: -r * Math.cos(a) }, g);
    }
    svgEl("circle", { cx: 0, cy: 0, r: 2500, class: "pole" }, this.svg);
    this.addLabel({ x: 0, y: -9000, text: "South Pole", cls: "pole-label", a: "middle" });
    this.addLabel({ x: 0, y: 236000, text: "0° (toward Earth)", cls: "lat-label", a: "middle" });

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

    const all = this.regions.map((r) => bbox(r.xy));
    this.fit({ xmin: Math.min(...all.map((b) => b.xmin)) - 25000, xmax: Math.max(...all.map((b) => b.xmax)) + 25000, ymin: Math.min(...all.map((b) => b.ymin)) - 15000, ymax: Math.max(...all.map((b) => b.ymax)) + 15000 }, 0.04);
    this.zoomHint.hidden = true;
    this.setCrumbs([{ text: "Lunar south pole" }]);
    this.renderHomeCard();
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
    for (const li of this.card.querySelectorAll("[data-id]")) li.classList.toggle("hover", li.dataset.id === id);
  }
  renderHomeCard() {
    this.card.innerHTML = `
      <h2>Pick a Landing Region</h2>
      <p class="hint">The nine candidate regions near the lunar south pole. Pick one, then a Landing Time, and every Landing Site is scored on whether the Sun and Earth stay in Line of Sight for the whole 7-day Surface Stay. Open any site to see it in 3D. Scroll to zoom, drag to pan.</p>
      <ol class="region-list">${this.regions.map((r) => {
        const [w, h] = sizeKm(r);
        return `<li><button type="button" data-id="${r.id}"><span>${r.name}${r.hasSiteData ? "" : ' <em class="soon">coming soon</em>'}</span><small>${w.toFixed(0)} × ${h.toFixed(0)} km · ${siteGrid(r).count.toLocaleString()} sites</small></button></li>`;
      }).join("")}</ol>
      <p class="credits">Hillshade: ${this.homeBasemap.source} (NASA, public domain). Regions: NASA news release 24-136 (2024-10-28). Terrain: LOLA (NASA PDS) · Region outlines: USGS candidate landing regions (CC0) · Sun/Earth: NAIF SPICE kernels (NASA JPL) · <a href="THIRD-PARTY-NOTICES.txt">Third-party software notices</a> · <a href="https://github.com/dhidru/nasa-space-apps-2026/blob/main/ATTRIBUTIONS.md">All attributions</a> · Not an official NASA product.</p>`;
    for (const b of this.card.querySelectorAll("button[data-id]")) {
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

    this.fit({ xmin: e.xmin, xmax: e.xmax, ymin: e.ymin, ymax: e.ymax }, 0.05);
    this.setCrumbs([{ text: "Lunar south pole", go: () => this.onHome() }, { text: r.name }]);
    this.renderRegionCard(r, grid, bm);
    if (selectedCell) this.markCell(grid.byId(selectedCell), this.selRect);

    this.dem = null;
    this.demFor(id).then((dem) => { if (this.region === r) { this.dem = dem; this.renderCell(this.lastCell); } }).catch((err) => console.error(err));
    if (r.hasSiteData) this.teamSites(id).then((t) => { if (this.region === r) { this.teamSiteData = t; this.renderCell(this.lastCell); } }).catch((err) => console.error(err));
    if (r.hasSiteData) this.loadTopTen(r, grid);

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
      <h2>${r.name}</h2>
      <p class="sub">${w.toFixed(1)} × ${h.toFixed(1)} km · ${grid.rows} × ${grid.cols} = ${grid.count.toLocaleString()} sites</p>
      <p class="hint">Each cell is one landing site: a 200 m grid with a 100 m-radius site circle at its centre, the grid from the team design. Hover a cell to read it, click it to open its 3D topography.</p>
      <dl class="cell-read" id="cellRead">
        <dt>Site</dt><dd data-k="id">—</dd>
        <dt>Latitude</dt><dd data-k="lat">—</dd>
        <dt>Longitude</dt><dd data-k="lon">—</dd>
        <dt>Elevation</dt><dd data-k="h">—</dd>
        <dt data-k="sl">Slope (200 m)</dt><dd data-k="s">—</dd>
        ${r.hasSiteData ? `<dt>Rank</dt><dd data-k="rank">—</dd><dt title="${ROBUSTNESS_TITLE}">Timing robustness</dt><dd data-k="robust">—</dd><dt title="${WALKABLE_TITLE}">EVA walkable (2 km)</dt><dd data-k="walk">—</dd>` : ""}
      </dl>
      ${r.hasSiteData ? `
      <section class="map-top">
        <label class="landing">Landing Time <span class="unit">UTC · 7-day Surface Stay</span>
          <input type="datetime-local" step="600" min="${formatUtc(SPAN_START).slice(0, 16)}" max="${formatUtc(SPAN_END - STEP_MS).slice(0, 16)}" value="${formatUtc(this.getLanding()).slice(0, 16)}">
        </label>
        <div class="steps" role="group" aria-label="Step the Landing Time">
          <button type="button" data-step="-86400000" title="One day earlier">−1 d</button>
          <button type="button" data-step="-3600000" title="One hour earlier">−1 h</button>
          <button type="button" data-step="3600000" title="One hour later">+1 h</button>
          <button type="button" data-step="86400000" title="One day later">+1 d</button>
        </div>
        <p class="fine">Supported Span: ${formatUtc(SPAN_START).slice(0, 10)} to ${formatUtc(SPAN_END).slice(0, 10)}. Surface Stay: 7 days from the Landing Time.</p>
        <div class="legend">
          <span><i style="background:${rgb(FULL_HIGH)}"></i> Full coverage (darker = more Clearance)</span>
          <span><i style="background:${rgb(PARTIAL_HIGH)}"></i><i style="background:${rgb(PARTIAL_LOW)}"></i> Partial (by the weaker of Sun and Earth)</span>
          <span><i class="outlined"></i> Top 10 (at least 2 km apart)</span>
          <span><i class="steep"></i> Landing slope over the limit</span>
        </div>
        <h3>Top 10 Landing Sites</h3>
        ${slopeLimitHtml(this.getSlopeLimit())}
        <p class="hint top-status"></p>
        <ol class="top-list"></ol>
      </section>` : ""}
      <p class="team-note">${r.hasSiteData
        ? "Team data: site heights from the pipeline's sites.json; Sun and Earth Clearance in the 3D view use the team's Horizons."
        : "Team site data (heights, Horizons) for this region is coming soon. Heights here are from the 80 m LOLA DEM."}</p>
      <button type="button" class="back">← All regions</button>
      <p class="credits">Hillshade: ${bm.source} (NASA, public domain). ${r.hasSiteData ? "Landing slope: LOLA 20 m DEM." : "Slope: LOLA 80 m DEM."} Terrain: LOLA (NASA PDS) · Region outlines: USGS candidate landing regions (CC0) · Sun/Earth: NAIF SPICE kernels (NASA JPL) · <a href="THIRD-PARTY-NOTICES.txt">Third-party software notices</a> · <a href="https://github.com/dhidru/nasa-space-apps-2026/blob/main/ATTRIBUTIONS.md">All attributions</a> · Not an official NASA product.</p>`;
    this.card.querySelector(".back").addEventListener("click", () => this.onHome());
    const input = this.card.querySelector(".landing input");
    const setT = (t) => {
      this.setLanding(t);
      input.value = formatUtc(this.getLanding()).slice(0, 16); // snapped to the 10-minute grid and the span
      this.loadTopTen(r, grid);
    };
    if (input) {
      input.addEventListener("change", () => { const t = Date.parse(`${input.value}:00Z`); if (!Number.isNaN(t)) setT(t); });
      for (const b of this.card.querySelectorAll(".map-top .steps button")) b.addEventListener("click", () => setT(this.getLanding() + Number(b.dataset.step)));
    }
    const limit = this.card.querySelector(".slope-limit select");
    if (limit) limit.addEventListener("change", () => { this.setSlopeLimit(slopeLimitOf(limit)); this.loadTopTen(r, grid); });
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
    if (status) status.textContent = "Scoring every Landing Site over the Surface Stay…";
    if (list) list.replaceChildren();
    try {
      const [res, team] = await Promise.all([this.ranking(r.id, landing, (f) => {
        if (token === this.topToken && status) status.textContent = `Scoring every Landing Site over the Surface Stay… ${Math.round(f * 100)} %`;
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
      if (status) status.textContent = `${nFull.toLocaleString()} of ${res.doc.sites.length.toLocaleString()} sites have Full Coverage`
        + (nFullFlat === null ? "" : `, ${nFullFlat.toLocaleString()} of them with a Landing Slope under ${limitDeg}°`)
        + `. Sites in the list are at least 2 km apart.`
        + (limitDeg !== null && !hasSlope ? " (No Landing Slopes for this region, so the slope limit is off.)" : "");
      top.forEach((e, i) => {
        const cell = grid.byId(e.site_id);
        if (!cell) return;
        svgEl("rect", { x: cell.x - GRID_M / 2, y: -(cell.y + GRID_M / 2), width: GRID_M, height: GRID_M, class: "top-cell", style: `fill:${coverageColor(e)};stroke:${coverageColor(e)}` }, this.topLayer);
        const lab = this.addLabel({ x: cell.x + GRID_M, y: cell.y + GRID_M, text: String(i + 1), cls: "top-label", a: "start", id: e.site_id });
        lab.addEventListener("click", () => this.onSite(r.id, e.site_id));
      });
      if (list) fillTopList(list, top, {
        robustnessOf: team ? (id) => team.robustnessOf(id) : undefined,
        slopeOf: team ? (id) => team.slopeOf(id) : undefined,
        walkableOf: team ? (id) => team.walkableOf(id) : undefined,
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
    set("lat", fmtLat(cell.lat));
    set("lon", fmtLon(cell.lon));
    const teamH = this.teamSiteData ? this.teamSiteData.heightOf(cell.id) : undefined;
    const team = teamH !== undefined;
    if (team) set("h", `${Math.round(teamH).toLocaleString()} m`);
    const teamSlope = this.teamSiteData ? this.teamSiteData.slopeOf(cell.id) : undefined;
    if (teamSlope !== undefined) set("s", slopeLabel(teamSlope));
    const label = this.card.querySelector('[data-k="sl"]');
    if (label) { label.textContent = teamSlope !== undefined ? "Landing slope" : "Slope (200 m)"; label.title = teamSlope !== undefined ? SLOPE_TITLE : ""; }
    if (this.dem) {
      if (!team) set("h", `${Math.round(this.dem.at(cell.x, cell.y)).toLocaleString()} m`);
      if (teamSlope === undefined) set("s", `${this.dem.slope(cell.x, cell.y).toFixed(1)}°`);
    } else { if (!team) set("h", "loading…"); if (teamSlope === undefined) set("s", "loading…"); }
    if (this.teamSiteData) {
      set("robust", robustnessLabel(this.teamSiteData.robustnessOf(cell.id)));
      set("walk", walkableLabel(this.teamSiteData.walkableOf(cell.id)));
    }
    const e = this.rankData && this.rankData.byId.get(cell.id);
    set("rank", e ? `${e.rank.toLocaleString()} of ${this.rankData.doc.sites.length.toLocaleString()}${this.topIds.has(cell.id) ? " · top 10" : ""} · ${coverageLabel(e)}` : this.region && this.region.hasSiteData ? "scoring…" : "—");
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
    this.flight.fadeTimer = setTimeout(() => { this.root.hidden = true; this.endFlight(); }, prefersReducedMotion() ? 0 : 600);
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

  setCrumbs(items) {
    this.crumbs.replaceChildren(...items.flatMap((it, i) => {
      const n = it.go ? Object.assign(document.createElement("button"), { type: "button", textContent: it.text, onclick: it.go }) : Object.assign(document.createElement("span"), { textContent: it.text });
      return i ? [Object.assign(document.createElement("span"), { className: "sep", textContent: "›" }), n] : [n];
    }));
  }
}

export { xyToLL };
