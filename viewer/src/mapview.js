// SPDX-License-Identifier: MIT
// 2D south polar map: the home view (all nine Artemis III regions) and the region view (200 m site grid).
// Map coordinates are polar stereographic metres (src/polar.js); SVG y is the negative of map y.
// Hillshades, outlines and site heights come from the team's site-data (src/teamdata.js).

import { GRID_M, siteGrid, bbox, xyToLL } from "./polar.js";
import { sizeKm } from "./regions.js";
import { formatUtc, coverageLabel, coverageColor, SPAN_START, SPAN_END, STEP_MS } from "./ranking.js";

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
   *           onHome:()=>void, demFor:(id)=>Promise<object> }} opts
   */
  constructor(root, opts) {
    Object.assign(this, opts);
    this.root = root;
    this.stage = root.querySelector(".map-stage");
    this.svg = svgEl("svg", { class: "map-svg", role: "img" }, this.stage);
    this.labels = Object.assign(document.createElement("div"), { className: "map-labels" });
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
  refit() { if (this.fitBox && !this.userMoved) this.fit(this.fitBox); else this.setVB(this.vb); }
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
      const [mx, my] = this.toMap(e), f = Math.exp(e.deltaY * 0.0015);
      const vb = this.vb, w = Math.min(Math.max(vb.w * f, 2000), 700000);
      const k = w / vb.w;
      this.userMoved = true;
      this.setVB({ x: mx - (mx - vb.x) * k, y: -my - (-my - vb.y) * k, w, h: vb.h * k });
    }, { passive: false });
    this.svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vb: { ...this.vb }, moved: false, id: e.pointerId, region: this.hovered }; });
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
    this.root.querySelector(".map-reset").addEventListener("click", () => { this.userMoved = false; this.fit(this.fitBox); });
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
      <h2>Artemis III candidate regions</h2>
      <p class="hint">NASA's nine candidate landing regions near the south pole. Hover to highlight one, click to open its 200 m site grid. Scroll to zoom, drag to pan.</p>
      <ol class="region-list">${this.regions.map((r) => {
        const [w, h] = sizeKm(r);
        return `<li><button type="button" data-id="${r.id}"><span>${r.name}</span><small>${w.toFixed(0)} × ${h.toFixed(0)} km · ${siteGrid(r).count.toLocaleString()} sites${r.hasSiteData ? " · team data" : ""}</small></button></li>`;
      }).join("")}</ol>
      <p class="credits">Hillshade: ${this.homeBasemap.source} (NASA, public domain). Region outlines: USGS (CC0, doi:10.5066/P1MEQ6UK). Processed by the team pipeline.</p>`;
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
    svgEl("path", { d: outer + inner, class: "mask", "fill-rule": "evenodd" }, this.svg);
    // grid lines on the 200 m cell edges
    let d = "";
    for (let x = e.xmin; x <= e.xmax + 1; x += GRID_M) d += `M${x},${-e.ymax}V${-e.ymin}`;
    for (let y = e.ymin; y <= e.ymax + 1; y += GRID_M) d += `M${e.xmin},${-y}H${e.xmax}`;
    this.gridPath = svgEl("path", { d, class: "grid" }, this.svg);
    svgEl("polygon", { points: r.xy.map(([x, y]) => `${x},${-y}`).join(" "), class: "region-outline" }, this.svg);
    this.hoverRect = svgEl("rect", { width: GRID_M, height: GRID_M, class: "cell-hover", visibility: "hidden" }, this.svg);
    this.selRect = svgEl("rect", { width: GRID_M, height: GRID_M, class: "cell-selected", visibility: "hidden" }, this.svg);
    this.topLayer = svgEl("g", { class: "top-cells" }, this.svg);
    this.rankData = null;

    this.fit({ xmin: e.xmin, xmax: e.xmax, ymin: e.ymin, ymax: e.ymax }, 0.05);
    this.setCrumbs([{ text: "Lunar south pole", go: () => this.onHome() }, { text: r.name }]);
    this.renderRegionCard(r, grid, bm);
    if (selectedCell) this.markCell(grid.byId(selectedCell), this.selRect);

    this.dem = null;
    this.demFor(id).then((dem) => { if (this.region === r) { this.dem = dem; this.renderCell(this.lastCell); } }).catch((err) => console.error(err));
    if (r.hasSiteData) this.teamSites(id).then((t) => { if (this.region === r) { this.teamSiteData = t; this.renderCell(this.lastCell); } }).catch((err) => console.error(err));
    if (r.hasSiteData) this.loadTopTen(r, grid);

    this.onMove = (ev) => {
      const [x, y] = this.toMap(ev), cell = grid.cellAt(x, y);
      this.markCell(cell, this.hoverRect);
      this.svg.style.cursor = cell ? "pointer" : "";
      if (cell) this.renderCell(cell);
    };
    this.onLeave = () => this.markCell(null, this.hoverRect);
    this.onClick = (ev) => {
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
        <dt>Slope (200 m)</dt><dd data-k="s">—</dd>
        ${r.hasSiteData ? '<dt>Rank</dt><dd data-k="rank">—</dd>' : ""}
      </dl>
      ${r.hasSiteData ? `
      <section class="map-top">
        <label class="landing">Landing Time <span class="unit">UTC · 7-day Surface Stay</span>
          <input type="datetime-local" step="600" min="${formatUtc(SPAN_START).slice(0, 16)}" max="${formatUtc(SPAN_END - STEP_MS).slice(0, 16)}" value="${formatUtc(this.getLanding()).slice(0, 16)}">
        </label>
        <h3>Top 10 Landing Sites</h3>
        <p class="hint top-status"></p>
        <ol class="top-list"></ol>
      </section>` : ""}
      <p class="team-note">${r.hasSiteData
        ? "Team data: site heights from the pipeline's sites.json; Sun and Earth Clearance in the 3D view use the team's Horizons."
        : "Team site data (heights, Horizons) for this region is coming soon. Heights here are from the 80 m LOLA DEM."}</p>
      <button type="button" class="back">← All regions</button>
      <p class="credits">Hillshade: ${bm.source} (NASA, public domain), via the team pipeline. Slope: LOLA 80 m DEM. Outline: USGS (CC0).</p>`;
    this.card.querySelector(".back").addEventListener("click", () => this.onHome());
    const input = this.card.querySelector(".landing input");
    if (input) input.addEventListener("change", () => {
      const t = Date.parse(`${input.value}:00Z`);
      if (Number.isNaN(t)) return;
      this.setLanding(t);
      input.value = formatUtc(this.getLanding()).slice(0, 16); // snapped to the 10-minute grid and the span
      this.loadTopTen(r, grid);
    });
  }

  /** Rank every site for the shared Landing Time and draw the top 10 (team science port, in a worker). */
  async loadTopTen(r, grid) {
    const token = (this.topToken = (this.topToken || 0) + 1), landing = this.getLanding();
    const status = this.card.querySelector(".top-status"), list = this.card.querySelector(".map-top .top-list");
    this.rankData = null;
    this.topLayer.replaceChildren();
    for (const l of this.labels.querySelectorAll(".top-label")) l.remove();
    if (status) status.textContent = "Scoring every Landing Site over the Surface Stay…";
    if (list) list.replaceChildren();
    try {
      const res = await this.ranking(r.id, landing, (f) => {
        if (token === this.topToken && status) status.textContent = `Scoring every Landing Site over the Surface Stay… ${Math.round(f * 100)} %`;
      });
      if (token !== this.topToken || this.region !== r) return;
      this.rankData = res;
      const nFull = res.doc.sites.filter((x) => x.coverage === "full").length;
      if (status) status.textContent = `${nFull.toLocaleString()} of ${res.doc.sites.length.toLocaleString()} sites have Full Coverage. Sites in the list are at least 2 km apart.`;
      res.top.forEach((e, i) => {
        const cell = grid.byId(e.site_id);
        if (!cell) return;
        svgEl("rect", { x: cell.x - GRID_M / 2, y: -(cell.y + GRID_M / 2), width: GRID_M, height: GRID_M, class: "top-cell", style: `fill:${coverageColor(e)};stroke:${coverageColor(e)}` }, this.topLayer);
        const lab = this.addLabel({ x: cell.x + GRID_M, y: cell.y + GRID_M, text: String(i + 1), cls: "top-label", a: "start", id: e.site_id });
        lab.addEventListener("click", () => this.onSite(r.id, e.site_id));
        if (list) {
          const li = document.createElement("li");
          li.innerHTML = `<button type="button"><span class="rk">${i + 1}</span><span class="sw" style="background:${coverageColor(e)}"></span><span class="id">${e.site_id}</span><span class="lb">${coverageLabel(e)}</span><span class="cl" title="Worst-case minimum Clearance over the stay (Sun or Earth)">${e.worst_case_min_clearance_deg.toFixed(2)}°</span></button>`;
          const b = li.querySelector("button");
          b.addEventListener("click", () => this.onSite(r.id, e.site_id));
          b.addEventListener("pointerenter", () => { this.markCell(cell, this.hoverRect); this.renderCell(cell); });
          list.appendChild(li);
        }
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
    const team = this.teamSiteData && this.teamSiteData.byId.get(cell.id);
    if (team) set("h", `${Math.round(team.terrain_height_m).toLocaleString()} m`);
    if (this.dem) {
      if (!team) set("h", `${Math.round(this.dem.at(cell.x, cell.y)).toLocaleString()} m`);
      set("s", `${this.dem.slope(cell.x, cell.y).toFixed(1)}°`);
    } else { if (!team) set("h", "loading…"); set("s", "loading…"); }
    const e = this.rankData && this.rankData.byId.get(cell.id);
    set("rank", e ? `${e.rank.toLocaleString()} of ${this.rankData.doc.sites.length.toLocaleString()}${e.top ? " · top 10" : ""} · ${coverageLabel(e)}` : this.region && this.region.hasSiteData ? "scoring…" : "—");
  }

  setCrumbs(items) {
    this.crumbs.replaceChildren(...items.flatMap((it, i) => {
      const n = it.go ? Object.assign(document.createElement("button"), { type: "button", textContent: it.text, onclick: it.go }) : Object.assign(document.createElement("span"), { textContent: it.text });
      return i ? [Object.assign(document.createElement("span"), { className: "sep", textContent: "›" }), n] : [n];
    }));
  }
}

export { xyToLL };
