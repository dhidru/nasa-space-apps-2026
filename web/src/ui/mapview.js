// SPDX-License-Identifier: MIT
// 2D south polar map: the home view (all nine Artemis IV regions) and the region view (200 m site grid).
// Map coordinates are polar stereographic metres (src/polar.js); SVG y is the negative of map y.
// Hillshades, outlines and site heights come from the team's site-data (src/teamdata.js).

import { GRID_M, siteGrid, bbox, xyToLL } from "./polar.js";
import { sizeKm } from "./regions.js";
import { prefersReducedMotion, easeInOutCubic, phase, SLICE_FIT_MARGIN } from "./transition.js";
import { fillTopList, slopeLimitHtml, bindSlopeLimit } from "./toplist.js";
import { Calendar, calendarHtml } from "./calendar.js";
import { parseHms, hms } from "../app/utctime.ts";
import { formatUtc, coverageLabel, coverageColor, robustnessLabel, ROBUSTNESS_TITLE, slopeLabel, underSlopeLimit, SLOPE_TITLE, walkableLabel, WALKABLE_TITLE, topUnderSlope, noFullStayDays, DAY_MS, FULL_HIGH, PARTIAL_HIGH, PARTIAL_LOW, rgb } from "./ranking.js";
import { featuredLanding } from "../app/featured.ts";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

// Home map: the Moon inside the 80° S circle, ringed by a dark bezel with the longitude scale (0° faces Earth).
const MOON_R = 1737400;
/** Polar stereographic radius (map metres) of a southern latitude in degrees, as in src/polar.js. */
const rhoOf = (lat) => 2 * MOON_R * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360);
const RIM_M = rhoOf(-80);
const BEZEL_PX = 30;                       // bezel width on screen
const HOME_MARGIN_PX = 50;                 // room around the circle for the bezel and its labels
const LAT_TICKS = [-88, -86, -84, -82];    // latitude ticks down the 180° meridian (keeps 0° clear for Earth)
const lonText = (lon) => (lon === 180 ? "180°" : lon < 180 ? `${lon}°E` : `${360 - lon}°W`);
/** Distance (screen px) between every region name and its square. */
const LABEL_GAP_PX = 5;
/**
 * Region names on the home map with a fixed side of their square (`lines` = two lines). They are placed first, in
 * this order, centred on the square when that spot is free, else slid along the same side; every other name is
 * placed automatically around them (layoutRegionLabels).
 */
const PINNED_LABELS = [
  ["malapert-massif", { side: "above", lines: true }],
  ["haworth", { side: "above" }],
  ["mons-mouton", { side: "below", lines: true }],
  ["nobile-rim-1", { side: "right" }],   // wraps to two lines if boxed in (Nobile Rim 2's square sits beside it)
  ["slater-plain", { side: "above" }],
];
const PINNED = new Map(PINNED_LABELS);
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
    if (this.mode === "home") this.fitHome();
    else if (this.fitBox && !this.userMoved) this.fit(this.fitBox); else this.setVB(this.vb);
  }
  setVB(vb) {
    const [W, H] = this.size();
    vb.h = (vb.w * H) / W; // keep aspect
    this.vb = vb;
    this.svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    if (this.mode === "home") this.drawBezel();
    this.placeLabels();
    if (this.mode === "home") this.layoutRegionLabels();
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
    this.svg.setAttribute("aria-label", "Map of the lunar south pole with the nine Artemis IV candidate regions");
    const h = this.homeBasemap, [x0, y0, x1, y1] = h.extent_m;
    // The Moon, clipped to the 80° S circle; drawBezel() rings it with the longitude scale.
    svgEl("circle", { r: RIM_M }, svgEl("clipPath", { id: "moon-clip" }, svgEl("defs", {}, this.svg)));
    svgEl("image", { href: h.href, x: x0, y: -y1, width: x1 - x0, height: y1 - y0, preserveAspectRatio: "none", class: "map-img", "clip-path": "url(#moon-clip)" }, this.svg);
    this.bezel = svgEl("g", { class: "bezel" }, this.svg);
    svgEl("circle", { cx: 0, cy: 0, r: 2500, class: "pole" }, this.svg);
    this.leaders = svgEl("g", { class: "leaders" }, this.svg);

    this.polys = {};
    this.regionLabels = new Map();
    for (const r of this.regions) {
      const pts = r.xy.map(([x, y]) => `${x},${-y}`).join(" ");
      const poly = svgEl("polygon", { points: pts, class: "region", "data-id": r.id, tabindex: 0, role: "button", "aria-label": `Open ${r.name}` }, this.svg);
      this.polys[r.id] = poly;
      // Placed by layoutRegionLabels() once the map is sized.
      const lab = this.addLabel({ x: 0, y: 0, text: r.name, cls: "region-label", a: "tl", id: r.id, lines: PINNED.get(r.id)?.lines });
      this.regionLabels.set(r.id, lab);
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

    this.fitHome();
    this.zoomHint.hidden = true;
    this.reset.hidden = true; // nothing to reset: the home map doesn't zoom or pan
    this.setCrumbs([{ text: "Lunar south pole" }]);
    this.renderHomeCard();
  }
  /** Fit the whole 80° S circle with HOME_MARGIN_PX around it for the bezel (the margin is in screen pixels). */
  fitHome() {
    const [W, H] = this.size(), m = Math.min(HOME_MARGIN_PX, Math.min(W, H) / 4);
    this.fit({ xmin: -RIM_M, xmax: RIM_M, ymin: -RIM_M, ymax: RIM_M }, m / Math.max(1, Math.min(W, H) - 2 * m));
  }
  /**
   * The bezel (home only): a dark ring outside 80° S with ticks every 10° and labels every 30°, the 0° EARTH
   * marker, and latitude ticks down the 180° meridian. Sizes are in screen pixels, so it is redrawn on every resize.
   */
  drawBezel() {
    if (!this.bezel) return;
    for (const l of this.labels.querySelectorAll(".bezel-label, .lat-label, .earth-label")) l.remove();
    this.bezel.replaceChildren();
    const [W] = this.size(), mpp = this.vb.w / W, rad = (d) => (d * Math.PI) / 180;
    const at = (r, lon) => [r * Math.sin(rad(lon)), r * Math.cos(rad(lon))]; // map metres; 0° up, 90° E right
    svgEl("circle", { r: RIM_M + (BEZEL_PX / 2) * mpp, class: "bezel-band", "stroke-width": BEZEL_PX }, this.bezel);
    svgEl("circle", { r: RIM_M, class: "bezel-rim" }, this.bezel);
    for (let lon = 0; lon < 360; lon += 10) {
      const [x1, y1] = at(RIM_M, lon), [x2, y2] = at(RIM_M + (lon % 30 ? 6 : 12) * mpp, lon);
      svgEl("line", { x1, y1: -y1, x2, y2: -y2, class: lon % 30 ? "bezel-tick" : "bezel-tick major" }, this.bezel);
      if (lon % 30 === 0 && lon !== 0) { const [x, y] = at(RIM_M + 23 * mpp, lon); this.addLabel({ x, y, text: lonText(lon), cls: "bezel-label", a: "middle" }); }
    }
    const [ex, ey] = at(RIM_M + 23 * mpp, 0);
    this.addLabel({ x: ex, y: ey, html: '<i class="earth-dot" aria-hidden="true"></i>0° EARTH', cls: "earth-label", a: "middle" });
    for (const lat of LAT_TICKS) {
      const y = -rhoOf(lat); // map y of the 180° meridian at this latitude
      svgEl("line", { x1: -4 * mpp, y1: -y, x2: 4 * mpp, y2: -y, class: "lat-tick" }, this.bezel);
      this.addLabel({ x: 7 * mpp, y, text: `${-lat}°`, cls: "lat-label", a: "start" });
    }
  }
  /**
   * Place the region names so none covers a square, another name, the pole or the latitude labels (home only).
   * Works in screen pixels: PINNED_LABELS first (fixed side), then the rest automatically, all LABEL_GAP_PX from their squares. For an
   * automatic name, spots slide along all four sides of its square at growing distances and the closest clear one
   * wins; several orders are tried (seeded shuffles, so the layout is stable) and the tightest layout is kept.
   * A name more than 6 px from its square gets a leader line.
   */
  layoutRegionLabels() {
    if (!this.regionLabels || this.mode !== "home") return;
    const [W, H] = this.size(), st = this.stage.getBoundingClientRect();
    const px = (x, y) => [((x - this.vb.x) / this.vb.w) * W, ((-y - this.vb.y) / this.vb.h) * H];
    const [cx0, cy0] = px(0, 0), rimPx = (RIM_M / this.vb.w) * W;
    const boxes = new Map(this.regions.map((r) => {
      const b = bbox(r.xy), [x0, y0] = px(b.xmin, b.ymax), [x1, y1] = px(b.xmax, b.ymin);
      return [r.id, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    }));
    const allBoxes = [...boxes.values()];
    const fixed = [{ x: cx0 - 5, y: cy0 - 5, w: 10, h: 10 }, ...[...this.labels.querySelectorAll(".lat-label")].map((l) => {
      const r = l.getBoundingClientRect();
      return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height };
    })];
    const hit = (a, b, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
    const inside = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].every(([x, y]) => Math.hypot(x - cx0, y - cy0) < rimPx - 4);
    const gap = (r, b) => Math.hypot(Math.max(0, b.x - (r.x + r.w), r.x - (b.x + b.w)), Math.max(0, b.y - (r.y + r.h), r.y - (b.y + b.h)));
    const items = this.regions.map((r) => {
      const el = this.regionLabels.get(r.id);
      return { id: r.id, el, b: boxes.get(r.id), w: el.offsetWidth, h: el.offsetHeight, pin: PINNED.get(r.id) };
    });
    const spotFor = (L, placed) => {
      const { b, w, h, pin } = L, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      let best = null, bestScore = Infinity;
      // Every name sits LABEL_GAP_PX from its square; only an automatic name with no room there moves further out.
      for (const d of pin ? [LABEL_GAP_PX] : [LABEL_GAP_PX, 8, 14, 22, 32, 46, 62]) {
        const xs = [cx - w / 2], ys = [cy - h / 2]; // the centred spot first, then slides along the side
        for (let x = b.x - w - 20; x <= b.x + b.w + 20; x += 1) xs.push(x);
        for (let y = b.y - h + 3; y <= b.y + b.h - 3; y += 1) ys.push(y);
        const cands = [];
        for (const y of ys) cands.push([b.x + b.w + d, y, "right"], [b.x - d - w, y, "left"]);
        for (const x of xs) cands.push([x, b.y - d - h, "above"], [x, b.y + b.h + d, "below"]);
        for (const [x, y, side] of cands) {
          if (pin && side !== pin.side) continue;
          const r = { x, y, w, h };
          if (!inside(r) || allBoxes.some((o) => hit(r, o)) || placed.some((o) => hit(r, o))) continue;
          const g = gap(r, b), score = g + (g > 6 ? 6 : 0) + (pin ? 0.3 : 0.05) * Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
          if (score < bestScore) { bestScore = score; best = r; }
        }
        if (best) break; // the closest distance that fits
      }
      if (!best && pin) return { ...spotFor({ ...L, pin: null }, placed), unpinned: true }; // pinned side blocked: place automatically
      return best ? { r: best, score: bestScore } : { r: { x: b.x + b.w + 3, y: cy - h / 2, w, h }, score: 1e4 };
    };
    const pinned = PINNED_LABELS.map(([id]) => items.find((L) => L.id === id)).filter(Boolean), auto = items.filter((L) => !L.pin);
    // A pinned one-line name whose side has no room (e.g. Nobile Rim 1, boxed in by Nobile Rim 2's square) wraps to
    // two lines before giving up its side. Checked against the pinned names placed before it.
    const pre = [...fixed];
    for (const L of pinned) {
      setLines(L.el, !!L.pin.lines);
      L.w = L.el.offsetWidth; L.h = L.el.offsetHeight;
      let s = spotFor(L, pre);
      if (s.unpinned && !L.pin.lines && L.el.textContent.includes(" ")) {
        setLines(L.el, true);
        const w1 = L.w, h1 = L.h;
        L.w = L.el.offsetWidth; L.h = L.el.offsetHeight;
        const s2 = spotFor(L, pre);
        if (s2.unpinned) { setLines(L.el, false); L.w = w1; L.h = h1; } else s = s2;
      }
      pre.push(s.r);
    }
    const placeAll = (order) => {
      const placed = [...fixed], at = new Map();
      let cost = 0;
      for (const L of [...pinned, ...order]) { const { r, score } = spotFor(L, placed); placed.push(r); at.set(L, r); cost += score; }
      return { at, cost };
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let best = placeAll(auto);
    for (let k = 0; k < 40; k++) {
      const order = [...auto];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const run = placeAll(order);
      if (run.cost < best.cost) best = run;
    }
    const toMap = (x, y) => [this.vb.x + (x / W) * this.vb.w, -(this.vb.y + (y / H) * this.vb.h)];
    this.leaders.replaceChildren();
    for (const L of items) {
      const r = best.at.get(L), b = L.b, [mx, my] = toMap(r.x, r.y);
      L.el.dataset.x = mx; L.el.dataset.y = my;
      const nx = Math.max(b.x, Math.min(r.x + r.w / 2, b.x + b.w)), ny = Math.max(b.y, Math.min(r.y + r.h / 2, b.y + b.h));
      const lx = Math.max(r.x, Math.min(nx, r.x + r.w)), ly = Math.max(r.y, Math.min(ny, r.y + r.h));
      if (Math.hypot(lx - nx, ly - ny) > 6) {
        const [ax, ay] = toMap(nx, ny), [bx, by] = toMap(lx, ly);
        svgEl("line", { x1: ax, y1: -ay, x2: bx, y2: -by, class: "leader" }, this.leaders);
      }
    }
    this.placeLabels();
  }
  /** A label over the map at map point (x, y). `html` replaces `text`; `lines` splits a name onto two lines. */
  addLabel({ x, y, text, html, cls, a, id, lines }) {
    const el = document.createElement(id ? "button" : "span");
    el.className = `map-label ${cls} anchor-${a}`;
    if (html) el.innerHTML = html;
    else { el.textContent = text; if (lines) setLines(el, true); }
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
      <p class="hint">Pick one of the nine Artemis IV regions to see its best Landing Sites.</p>
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
    this.regionLabels = null;
    this.bezel = null;
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
    this.noStay = null; // No-Full-Stay Days (UTC day starts), crossed out on the calendar
    if (!r.hasSiteData) { this.filterBody.innerHTML = `<p class="filter-note">Landing Times for ${r.name} are coming soon.</p>`; return; }
    const t = new Date(this.getLanding());
    this.filterBody.innerHTML = `
      <h2>Landing Time</h2>
      <p class="filter-note">Pick a day, then type a time (UTC). The crew stays 7 days.</p>
      ${calendarHtml()}
      <div class="cal-key">
        <span><i class="k-land"></i> Landing day (day 1)</span>
        <span><i class="k-stay"></i> Days 2–7 of the surface stay</span>
        <span><i class="k-nostay"></i> No full 7-day window anywhere in the region</span>
        <span class="cal-status">Checking which days have a full 7-day window…</span>
      </div>
      <div class="time-pick">
        <label>Time (24 h) <input class="t-hms" type="text" inputmode="numeric" maxlength="8" autocomplete="off" spellcheck="false" aria-label="Landing time, 24-hour UTC, hh:mm:ss" placeholder="hh:mm:ss"></label>
        <span class="utc">UTC</span>
      </div>
      <p class="filter-note time-note">Rounds to the nearest 10 minutes (the Sun and Earth data are every 10 minutes). ↑ / ↓ step 10 minutes.</p>
      <p class="filter-picked" aria-live="polite"></p>
      <p class="nostay-warn" role="note" hidden></p>
      <button type="button" class="filter-clear">Clear selection</button>
      <h2 class="side-h">Landing Slope</h2>
      ${slopeLimitHtml(this.getSlopeLimit())}`;
    bindSlopeLimit(this.filterBody, (limit) => { this.setSlopeLimit(limit); if (this.picked) this.loadTopTen(r, grid); });
    this.cal = new Calendar(this.filterBody, { onPick: (day) => this.pickDay(day) });
    this.cal.showMonthOf(t.getTime());

    // Typed 24-hour time (hh:mm:ss). On Enter, blur or ↑/↓ it is read, rounded to the 10-minute Landing Time grid
    // and shown back as hh:mm:ss; a time that can't be read puts back the last good one.
    const box = this.filterBody.querySelector(".t-hms");
    const STEP_S = 600, DAY_S = 86400;
    // Until a Landing Time is chosen the box is blank (null); picking a day with no time typed lands at 00:00:00.
    let sec = this.picked ? Math.round((((t.getTime() % DAY_MS) + DAY_MS) % DAY_MS) / 1000) : null;
    const show = () => { box.value = sec === null ? "" : hms(sec); box.classList.remove("bad"); };
    show();
    const dayOf = (ms) => ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS);
    this.pickDay = (day) => {
      sec ??= 0;
      show();
      this.setLanding(day + sec * 1000);
      this.picked = true; // before drawing, so the calendar marks the chosen day
      this.drawCalendar();
      this.setPicked(true, r, grid);
    };
    const commit = (s) => {
      const next = s === null ? null : Math.min(DAY_S - STEP_S, Math.round(s / STEP_S) * STEP_S);
      const changed = next !== sec;
      sec = next;
      show();
      if (changed && this.picked) this.pickDay(dayOf(this.getLanding()));
    };
    const read = () => {
      if (box.value.trim() === "") return sec;
      const s = parseHms(box.value);
      if (s === null) { box.classList.add("bad"); return sec; }
      return s;
    };
    box.addEventListener("input", () => { box.value = box.value.replace(/[^\d:]/g, "").slice(0, 8); });
    box.addEventListener("focus", () => box.select());
    box.addEventListener("change", () => commit(read()));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(read()); box.select(); return; }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      // ±10 minutes, wrapping within the day; a blank box steps to 00:00:00
      const d = e.key === "ArrowUp" ? STEP_S : -STEP_S, cur = read();
      commit(cur === null ? 0 : (cur + d + DAY_S) % DAY_S);
      box.select();
    });

    this.filterBody.querySelector(".filter-clear").addEventListener("click", () => {
      sec = null;
      show();
      this.setPicked(false, r, grid);
      this.drawCalendar();
    });
    this.drawCalendar();
    const status = (text) => { const st = this.filterBody.querySelector(".cal-status"); if (st) st.textContent = text; };
    noFullStayDays(r.id, (f) => { if (this.region === r) status(`Checking which days have a full 7-day window… ${Math.round(f * 100)} %`); }).then((days) => {
      if (this.region !== r) return;
      this.noStay = new Set(days);
      status(days.length ? `${days.length} ${days.length === 1 ? "day has" : "days have"} no full 7-day window, crossed out` : "Every day has a full 7-day window somewhere");
      this.drawCalendar();
    }).catch((err) => { console.error(err); status("Couldn't check the 7-day windows"); });
  }
  /** Redraw the calendar (src/ui/calendar.js) and the picked-day line, Clear button and No-Full-Stay warning under it. */
  drawCalendar() {
    if (!this.cal || !this.filterBody.querySelector(".cal-grid")) return;
    const fmt = (ms, o) => new Date(ms).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
    const chosen = this.picked ? new Date(this.getLanding()) : null;
    const chosenDay = chosen && Date.UTC(chosen.getUTCFullYear(), chosen.getUTCMonth(), chosen.getUTCDate());
    this.cal.chosen = chosen && chosen.getTime();
    this.cal.noStay = this.noStay;
    this.cal.draw();
    this.filterBody.querySelector(".filter-picked").innerHTML = chosen
      ? `Landing <b>${fmt(chosenDay, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b> at <b>${formatUtc(this.getLanding()).slice(11, 19)} UTC</b>`
        + (this.region && featuredLanding(this.region.id) === this.getLanding() ? `<br><span class="featured-note">A suggested time when sites here keep the Sun and Earth in view all week. Pick any other day to compare.</span>` : "")
      : "No date chosen yet";
    this.filterBody.querySelector(".filter-clear").disabled = !this.picked;
    const warn = this.filterBody.querySelector(".nostay-warn");
    warn.hidden = !(chosen && this.noStay?.has(chosenDay));
    if (!warn.hidden) warn.innerHTML = `<b>No full 7-day window.</b> No site in this region keeps the Sun and Earth in view for a whole `
      + `7-day stay starting on this day, at any landing time. The coverage colours and the top 10 show the best partial options.`;
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

/** Show a label's text on one line, or on two when `two` is true (split where the lines come out most even). */
function setLines(el, two) {
  const text = el.dataset.text ?? (el.dataset.text = el.textContent);
  const w = text.split(" ");
  if (!two || w.length < 2) { el.textContent = text; return; }
  let k = 1;
  for (let i = 2; i < w.length; i++) {
    const len = (j) => Math.max(w.slice(0, j).join(" ").length, w.slice(j).join(" ").length);
    if (len(i) < len(k)) k = i;
  }
  el.replaceChildren(w.slice(0, k).join(" "), document.createElement("br"), w.slice(k).join(" "));
}

export { xyToLL };
