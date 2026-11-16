// SPDX-License-Identifier: MIT
// The Surface Stay panel: stats, sky plot, time charts and Landing Windows (first written as React components
// StatsTable, SkyPlot, TimeCharts, LandingWindowsPanel; design.md §5, §7), as plain DOM. The numbers
// come from the science worker (src/ui/ranking.js detail / windows).
import {
  pct, coverageLabel, parseUtc, formatUtc, HOUR_MS, DAY_MS, STEP_MS, SPAN_START, SPAN_END,
  SUN_COLOR, EARTH_COLOR, LOS_COLOR, BLOCKED_COLOR,
} from "./ranking.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const deg = (v) => `${v.toFixed(2)}°`;
const utc = (s) => s.replace("T", " ").slice(0, 19) + " UTC";

/* ---------- stats over the Surface Stay (StatsTable.tsx) ---------- */
export function statsTable(doc) {
  const until = (s) => s.first_los_loss_utc === null
    ? "Never during the stay"
    : `${((parseUtc(s.first_los_loss_utc) - parseUtc(doc.landing_time_utc)) / HOUR_MS).toFixed(1)} h (${utc(s.first_los_loss_utc)})`;
  const rows = [
    ["Min / mean / max Clearance", (s) => `${deg(s.min_clearance_deg)} / ${deg(s.mean_clearance_deg)} / ${deg(s.max_clearance_deg)}`],
    ["In Line of Sight", (s) => `${pct(s.los_fraction)} (${s.los_duration_h.toFixed(1)} h)`],
    ["Time until Line of Sight is lost", until],
    ["Min / mean / max Sun or Earth Elevation", (s) => `${deg(s.min_elevation_deg)} / ${deg(s.mean_elevation_deg)} / ${deg(s.max_elevation_deg)}`],
  ];
  const w = doc.worst_case_min_clearance_deg;
  return `<table class="stats"><thead><tr><th></th><th class="sun">Sun</th><th class="earth">Earth</th></tr></thead><tbody>
    ${rows.map(([label, f]) => `<tr><th>${label}</th><td>${f(doc.stats.sun)}</td><td>${f(doc.stats.earth)}</td></tr>`).join("")}
    <tr><th>Worst-case min Clearance</th><td colspan="2">${deg(w)} ${w > 0 ? "(always in view)" : "(blocked at times)"}</td></tr>
  </tbody></table>`;
}

/* ---------- sky plot panorama (SkyPlot.tsx) ---------- */
function ticks(lo, hi) {
  const span = hi - lo, step = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}
function segments(az, el, x, y) {
  const out = [];
  let cur = [];
  az.forEach((a, k) => {
    if (k > 0 && Math.abs(a - az[k - 1]) > 180) { out.push(cur.join(" ")); cur = []; }
    cur.push(`${cur.length ? "L" : "M"}${x(a).toFixed(1)},${y(el[k]).toFixed(1)}`);
  });
  out.push(cur.join(" "));
  return out;
}
export function skyPlot(doc) {
  const W = 720, H = 260, L = 40, R = 10, T = 12, B = 30;
  const hz = doc.horizon.elevation_deg, { sun, earth } = doc.series;
  const all = [...hz, ...sun.elevation_deg, ...earth.elevation_deg];
  const lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 1);
  const x = (a) => L + (a / 360) * (W - L - R), y = (e) => T + ((hi - e) / (hi - lo)) * (H - T - B);
  const terrain = `M${x(0)},${y(lo)} ` + hz.map((e, k) => `L${x(k * doc.horizon.azimuth_step_deg).toFixed(1)},${y(e).toFixed(1)}`).join(" ") + ` L${x(360)},${y(hz[0])} L${x(360)},${y(lo)} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Sky plot: Horizon with the Sun and Earth paths">
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" class="sky"/>
    ${ticks(lo, hi).map((e) => `<line x1="${L}" x2="${W - R}" y1="${y(e)}" y2="${y(e)}" class="${e === 0 ? "axis0" : "grid"}"/><text x="${L - 4}" y="${y(e) + 4}" text-anchor="end" class="tick">${e}°</text>`).join("")}
    ${[0, 90, 180, 270, 360].map((a) => `<text x="${x(a)}" y="${H - 10}" text-anchor="middle" class="tick">${a === 360 ? "N" : ["N 0°", "E 90°", "S 180°", "W 270°"][a / 90]}</text>`).join("")}
    <path d="${terrain}" class="terrain"/>
    ${segments(sun.azimuth_deg, sun.elevation_deg, x, y).map((d) => `<path d="${d}" stroke="${SUN_COLOR}" class="path"/>`).join("")}
    ${segments(earth.azimuth_deg, earth.elevation_deg, x, y).map((d) => `<path d="${d}" stroke="${EARTH_COLOR}" class="path"/>`).join("")}
    <circle cx="${x(sun.azimuth_deg[0])}" cy="${y(sun.elevation_deg[0])}" r="4" fill="${SUN_COLOR}"/>
    <circle cx="${x(earth.azimuth_deg[0])}" cy="${y(earth.elevation_deg[0])}" r="4" fill="${EARTH_COLOR}"/>
    <g class="key" transform="translate(${L + 8}, ${T + 14})">
      <circle r="4" fill="${SUN_COLOR}"/><text x="8" y="4">Sun path</text>
      <circle cx="80" r="4" fill="${EARTH_COLOR}"/><text x="88" y="4">Earth path</text>
      <text x="170" y="4">· gray = terrain</text>
    </g>
  </svg>`;
}

/* ---------- Sun / Earth elevation over the Horizon (TimeCharts.tsx) ---------- */
function panel(name, color, s, times) {
  const W = 720, H = 170, L = 40, R = 10, T = 10, B = 24, n = times.length;
  const all = [...s.elevation_deg, ...s.horizon_elevation_deg];
  const lo = Math.floor(Math.min(...all) - 0.5), hi = Math.ceil(Math.max(...all) + 0.5);
  const x = (k) => L + (k / (n - 1)) * (W - L - R), y = (e) => T + ((hi - e) / (hi - lo)) * (H - T - B);
  const line = (v) => v.map((e, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join(" ");
  // One quad per step between the two lines, coloured by the sign of Clearance at its start.
  let quads = "";
  for (let k = 0; k < n - 1; k++) {
    const e0 = s.elevation_deg[k], e1 = s.elevation_deg[k + 1], h0 = s.horizon_elevation_deg[k], h1 = s.horizon_elevation_deg[k + 1];
    quads += `<path d="M${x(k).toFixed(1)},${y(e0).toFixed(1)} L${x(k + 1).toFixed(1)},${y(e1).toFixed(1)} L${x(k + 1).toFixed(1)},${y(h1).toFixed(1)} L${x(k).toFixed(1)},${y(h0).toFixed(1)} Z" fill="${e0 - h0 > 0 ? LOS_COLOR : BLOCKED_COLOR}"/>`;
  }
  const perDay = DAY_MS / STEP_MS, days = Array.from({ length: Math.ceil(n / perDay) }, (_, d) => d * perDay);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${name} Elevation and the Horizon Elevation under the ${name}">
    ${ticks(lo, hi).map((e) => `<line x1="${L}" x2="${W - R}" y1="${y(e)}" y2="${y(e)}" class="${e === 0 ? "axis0" : "grid"}"/><text x="${L - 4}" y="${y(e) + 4}" text-anchor="end" class="tick">${e}°</text>`).join("")}
    ${days.map((k) => `<line x1="${x(k)}" x2="${x(k)}" y1="${T}" y2="${H - B}" class="grid"/><text x="${x(k)}" y="${H - 8}" text-anchor="middle" class="tick">${times[k].slice(5, 10)}</text>`).join("")}
    <g shape-rendering="crispEdges">${quads}</g>
    <path d="${line(s.horizon_elevation_deg)}" class="terrain-line"/>
    <path d="${line(s.elevation_deg)}" stroke="${color}" class="path"/>
    <text x="${W - R - 4}" y="${T + 12}" text-anchor="end" class="panel-title" fill="${color}">${name}</text>
  </svg>`;
}
export function timeCharts(doc) {
  return panel("Sun", SUN_COLOR, doc.series.sun, doc.series.time_utc) + panel("Earth", EARTH_COLOR, doc.series.earth, doc.series.time_utc) +
    `<p class="fine">Green: in view. Red: blocked by terrain. Gray line: the terrain.</p>`;
}

/* ---------- Landing Windows (LandingWindowsPanel.tsx) ---------- */
export function windowsView(doc, landing) {
  const W = 720, H = 48, PAD = 6, margin = 7 * DAY_MS, t0 = SPAN_START - margin, t1 = SPAN_END + margin;
  const x = (t) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD);
  const months = Array.from({ length: 13 }, (_, i) => Date.UTC(2026, 11 + i, 1)).filter((t) => t < SPAN_END);
  const strip = `<svg viewBox="0 0 ${W} ${H}" class="chart strip" role="img" aria-label="Coverage of every Landing Time in the Supported Span">
    <rect x="${PAD}" y="4" width="${W - 2 * PAD}" height="22" fill="#555"/>
    ${doc.strip.runs.map((r) => {
      const s = parseUtc(r.start_utc), e = parseUtc(r.end_utc), geo = `x="${x(s)}" y="4" height="22" width="${Math.max(x(e) - x(s), 0.5)}"`;
      if (r.coverage !== "full") return `<rect ${geo} fill="#e0a030"/>`;
      // A green run is a button: it lands at the Best Landing Time of the window it belongs to, else at its start.
      const w = doc.windows.find((w) => parseUtc(w.start_utc) <= s && e <= parseUtc(w.end_utc));
      const t = w ? w.best_landing_time_utc : r.start_utc, when = utc(t);
      const what = `Full Coverage ${utc(r.start_utc)} to ${utc(r.end_utc)}. Land at ${when}`;
      return `<rect ${geo} fill="#2fae4a" class="seg-full" data-t="${esc(t)}" tabindex="0" role="button" aria-label="${esc(what)}"><title>${esc(what)}</title></rect>`;
    }).join("")}
    <line x1="${x(landing)}" x2="${x(landing)}" y1="0" y2="30" stroke="#fff" stroke-width="2" pointer-events="none"/>
    ${months.map((t) => `<text x="${x(t)}" y="42" class="tick" text-anchor="middle">${new Date(t).toLocaleString("en", { month: "short", timeZone: "UTC" })}</text>`).join("")}
  </svg><p class="fine">Green: Full Coverage (click to land there). Amber: Partial. Gray: outside the Supported Span. White line: current Landing Time.</p>`;
  if (!doc.windows.length) return strip + `<p class="status">This site has no Landing Time with Full Coverage in the Supported Span.</p>`;
  const dur = (h) => (h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);
  // In date order; the window ranked first (highest worst-case Clearance) gets a Best badge.
  const byDate = [...doc.windows].sort((a, b) => parseUtc(a.start_utc) - parseUtc(b.start_utc));
  const best = doc.windows.reduce((m, w) => (w.rank < m.rank ? w : m));
  return strip + `<table class="windows-list"><thead><tr><th>Window (UTC)</th><th>Length</th><th>Best Landing Time</th><th>Worst-case</th></tr></thead><tbody>
    ${byDate.map((w) => `<tr data-t="${esc(w.best_landing_time_utc)}" title="Set this Landing Time"${w === best ? ' class="best"' : ""}>
      <td>${w === best ? '<span class="best-badge" title="Highest worst-case Clearance">★ Best</span> ' : ""}${w.start_utc.slice(0, 19).replace("T", " ")} → ${w.end_utc.slice(0, 19).replace("T", " ")}${w.contains_partial_gaps ? " *" : ""}</td>
      <td>${dur(w.duration_h)}</td><td><button type="button" class="link">${w.best_landing_time_utc.slice(0, 19).replace("T", " ")}</button></td>
      <td>${w.best_worst_case_min_clearance_deg.toFixed(2)}°</td></tr>`).join("")}
  </tbody></table>${doc.windows.some((w) => w.contains_partial_gaps) ? `<p class="fine">* Includes short Partial gaps (under ${doc.merge_gap_h} h) that were merged into the window.</p>` : ""}`;
}

/** Header line for the panel: region and rank (e.g. "Haworth · Rank #1"), then coverage. */
export const stayTitle = (label, entry) => `${esc(label)}${entry ? ` <span class="sub">· ${esc(coverageLabel(entry))}</span>` : ""}`;
/** The 7-day verdict in one line: how much of the stay the Sun and Earth are in view, and the worst-case Clearance. */
export const stayVerdict = (doc) => {
  const w = doc.worst_case_min_clearance_deg;
  return `<span class="sun">Sun ${pct(doc.stats.sun.los_fraction)}</span> · <span class="earth">Earth ${pct(doc.stats.earth.los_fraction)}</span> in view`
    + ` · min clearance <b class="${w > 0 ? "ok" : "bad"}">${w > 0 ? "+" : ""}${w.toFixed(2)}°</b>`;
};
export const stayRange = (doc) => `Surface Stay ${formatUtc(parseUtc(doc.landing_time_utc)).slice(0, 19).replace("T", " ")} to ${doc.stay_end_utc.slice(0, 19).replace("T", " ")} UTC`;
