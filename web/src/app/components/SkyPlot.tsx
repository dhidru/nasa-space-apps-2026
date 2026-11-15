/**
 * Sky plot as a 360° panorama: the site's Horizon as terrain, with the Sun's and Earth's paths over the
 * Surface Stay. Near the pole both bodies stay within a few degrees of the horizon, so a panorama
 * (azimuth across, elevation up) shows the Clearance far better than a zenith-centered polar plot.
 */
import type { SiteDetailDoc } from "../../science/results";
import { EARTH_COLOR, SUN_COLOR } from "../coverage";

const W = 720, H = 260, L = 40, R = 10, T = 12, B = 30;

/** Splits a path where azimuth wraps through 0°/360°, so lines don't cross the whole plot. */
function segments(az: number[], el: number[], x: (a: number) => number, y: (e: number) => number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  az.forEach((a, k) => {
    if (k > 0 && Math.abs(a - az[k - 1]) > 180) {
      out.push(cur.join(" "));
      cur = [];
    }
    cur.push(`${cur.length ? "L" : "M"}${x(a).toFixed(1)},${y(el[k]).toFixed(1)}`);
  });
  out.push(cur.join(" "));
  return out;
}

export function SkyPlot({ doc }: { doc: SiteDetailDoc }) {
  const hz = doc.horizon.elevation_deg;
  const { sun, earth } = doc.series;
  const all = [...hz, ...sun.elevation_deg, ...earth.elevation_deg];
  const lo = Math.floor(Math.min(...all) - 1);
  const hi = Math.ceil(Math.max(...all) + 1);
  const x = (a: number) => L + (a / 360) * (W - L - R);
  const y = (e: number) => T + ((hi - e) / (hi - lo)) * (H - T - B);
  const terrain = `M${x(0)},${y(lo)} ` + hz.map((e, k) => `L${x(k * doc.horizon.azimuth_step_deg).toFixed(1)},${y(e).toFixed(1)}`).join(" ") + ` L${x(360)},${y(hz[0])} L${x(360)},${y(lo)} Z`;
  const yTicks = ticks(lo, hi);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Sky plot: Horizon with the Sun and Earth paths">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="sky" />
      {yTicks.map((e) => (
        <g key={e}>
          <line x1={L} x2={W - R} y1={y(e)} y2={y(e)} className={e === 0 ? "axis0" : "grid"} />
          <text x={L - 4} y={y(e) + 4} textAnchor="end" className="tick">{e}°</text>
        </g>
      ))}
      {[0, 90, 180, 270, 360].map((a) => (
        <text key={a} x={x(a)} y={H - 10} textAnchor="middle" className="tick">
          {a === 360 ? "N" : ["N 0°", "E 90°", "S 180°", "W 270°"][a / 90]}
        </text>
      ))}
      <path d={terrain} className="terrain" />
      {segments(sun.azimuth_deg, sun.elevation_deg, x, y).map((d, i) => <path key={`s${i}`} d={d} stroke={SUN_COLOR} className="path" />)}
      {segments(earth.azimuth_deg, earth.elevation_deg, x, y).map((d, i) => <path key={`e${i}`} d={d} stroke={EARTH_COLOR} className="path" />)}
      <circle cx={x(sun.azimuth_deg[0])} cy={y(sun.elevation_deg[0])} r={4} fill={SUN_COLOR} />
      <circle cx={x(earth.azimuth_deg[0])} cy={y(earth.elevation_deg[0])} r={4} fill={EARTH_COLOR} />
      <g className="key" transform={`translate(${L + 8}, ${T + 14})`}>
        <circle r={4} fill={SUN_COLOR} /><text x={8} y={4}>Sun path</text>
        <circle cx={80} r={4} fill={EARTH_COLOR} /><text x={88} y={4}>Earth path</text>
        <text x={170} y={4}>(dot = Landing Time) · gray = Horizon</text>
      </g>
    </svg>
  );
}

export function ticks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}
