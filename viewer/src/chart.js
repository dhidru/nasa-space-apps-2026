// SPDX-License-Identifier: MIT
// Sun and Earth elevation over time at one site, drawn as SVG (no chart library).

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

/**
 * @param {SVGSVGElement} svg
 * @param {{t:Date,sunEl:number,earthEl:number,sunVis:number,earthVis:number}[]} series
 * @param {Date} now
 * @param {{onPick:(d:Date)=>void, onHover:(p:object|null)=>void}} handlers
 */
export function drawTimeline(svg, series, now, { onPick, onHover }) {
  const W = Math.max(280, svg.clientWidth || svg.parentElement.clientWidth);
  const H = Math.max(120, svg.clientHeight || 150);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  if (!series.length) return;

  const m = { l: 36, r: 10, t: 8, b: 22 };
  const t0 = series[0].t.getTime(), t1 = series[series.length - 1].t.getTime();
  let lo = -5, hi = 5;
  for (const p of series) { lo = Math.min(lo, p.sunEl, p.earthEl); hi = Math.max(hi, p.sunEl, p.earthEl); }
  const pad = (hi - lo) * 0.08; lo = Math.max(-90, lo - pad); hi = Math.min(90, hi + pad);
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);

  // darkness bands (Sun hidden by night or terrain)
  const step = series.length > 1 ? series[1].t - series[0].t : 3600000;
  let start = null;
  series.forEach((p, i) => {
    const dark = p.sunVis < 0.5;
    if (dark && start === null) start = p.t.getTime();
    if ((!dark || i === series.length - 1) && start !== null) {
      const end = dark ? p.t.getTime() + step : p.t.getTime();
      el("rect", { class: "tl-dark", x: x(start), y: m.t, width: Math.max(1, x(end) - x(start)), height: H - m.t - m.b }, svg);
      start = null;
    }
  });

  // y grid and labels
  const yStep = niceStep((hi - lo) / 4);
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) {
    el("line", { class: v === 0 ? "tl-zero" : "tl-grid", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, svg);
    el("text", { class: "tl-label", x: m.l - 6, y: y(v) + 3, "text-anchor": "end" }, svg).textContent = `${Math.round(v)}°`;
  }
  // x ticks every ~5 days at 00:00 UTC
  const day = 86400000, firstDay = Math.ceil(t0 / day) * day;
  const every = W < 520 ? 7 : 5;
  for (let t = firstDay, i = 0; t <= t1; t += day, i++) {
    if (i % every) continue;
    el("line", { class: "tl-grid", x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }, svg);
    const d = new Date(t);
    el("text", { class: "tl-label", x: x(t), y: H - 6, "text-anchor": "middle" }, svg).textContent =
      `${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
  }

  const path = (key) => series.map((p, i) => `${i ? "L" : "M"}${x(p.t.getTime()).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  el("path", { class: "tl-earth", d: path("earthEl") }, svg);
  el("path", { class: "tl-sun", d: path("sunEl") }, svg);

  const nx = x(now.getTime());
  if (nx >= m.l && nx <= W - m.r) el("line", { class: "tl-now", x1: nx, x2: nx, y1: m.t, y2: H - m.b }, svg);
  const hover = el("line", { class: "tl-hover", x1: 0, x2: 0, y1: m.t, y2: H - m.b, visibility: "hidden" }, svg);

  const at = (evt) => {
    const r = svg.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * W;
    const f = Math.min(1, Math.max(0, (px - m.l) / (W - m.l - m.r)));
    const i = Math.round(f * (series.length - 1));
    return { p: series[i], px: x(series[i].t.getTime()) };
  };
  svg.onpointermove = (e) => {
    const { p, px } = at(e);
    hover.setAttribute("x1", px); hover.setAttribute("x2", px); hover.setAttribute("visibility", "visible");
    onHover(p);
  };
  svg.onpointerleave = () => { hover.setAttribute("visibility", "hidden"); onHover(null); };
  svg.onclick = (e) => onPick(at(e).p.t);
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
