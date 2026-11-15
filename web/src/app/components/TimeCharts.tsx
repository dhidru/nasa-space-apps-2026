/**
 * Two stacked panels, Sun (yellow) and Earth (blue): the body's elevation and the terrain line under it
 * (the Horizon Elevation at the body's azimuth). The gap is green in Line of Sight, red when blocked.
 */
import type { SeriesDoc, SiteDetailDoc } from "../../science/results";
import { BLOCKED_COLOR, EARTH_COLOR, LOS_COLOR, SUN_COLOR } from "../coverage";
import { ticks } from "./SkyPlot";
import { DAY_MS, STEP_MS } from "../../science/time";

const W = 720, H = 170, L = 40, R = 10, T = 10, B = 24;

function Panel({ name, color, s, times }: { name: string; color: string; s: SeriesDoc; times: string[] }) {
  const n = times.length;
  const all = [...s.elevation_deg, ...s.horizon_elevation_deg];
  const lo = Math.floor(Math.min(...all) - 0.5);
  const hi = Math.ceil(Math.max(...all) + 0.5);
  const x = (k: number) => L + (k / (n - 1)) * (W - L - R);
  const y = (e: number) => T + ((hi - e) / (hi - lo)) * (H - T - B);
  const line = (v: number[]) => v.map((e, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join(" ");
  // One quad per step between the two lines, colored by the sign of Clearance at its start.
  const quads = [];
  for (let k = 0; k < n - 1; k++) {
    const e0 = s.elevation_deg[k], e1 = s.elevation_deg[k + 1], h0 = s.horizon_elevation_deg[k], h1 = s.horizon_elevation_deg[k + 1];
    quads.push(
      <path key={k} d={`M${x(k)},${y(e0)} L${x(k + 1)},${y(e1)} L${x(k + 1)},${y(h1)} L${x(k)},${y(h0)} Z`} fill={e0 - h0 > 0 ? LOS_COLOR : BLOCKED_COLOR} />,
    );
  }
  const stepsPerDay = DAY_MS / STEP_MS;
  const days = Array.from({ length: Math.ceil(n / stepsPerDay) }, (_, d) => d * stepsPerDay);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${name} Elevation and the Horizon Elevation under the ${name}`}>
      {ticks(lo, hi).map((e) => (
        <g key={e}>
          <line x1={L} x2={W - R} y1={y(e)} y2={y(e)} className={e === 0 ? "axis0" : "grid"} />
          <text x={L - 4} y={y(e) + 4} textAnchor="end" className="tick">{e}°</text>
        </g>
      ))}
      {days.map((k) => (
        <g key={k}>
          <line x1={x(k)} x2={x(k)} y1={T} y2={H - B} className="grid" />
          <text x={x(k)} y={H - 8} textAnchor="middle" className="tick">{times[k].slice(5, 10)}</text>
        </g>
      ))}
      <g shapeRendering="crispEdges">{quads}</g>
      <path d={line(s.horizon_elevation_deg)} className="terrain-line" />
      <path d={line(s.elevation_deg)} stroke={color} className="path" />
      <text x={W - R - 4} y={T + 12} textAnchor="end" className="panel-title" fill={color}>{name}</text>
    </svg>
  );
}

export function TimeCharts({ doc }: { doc: SiteDetailDoc }) {
  return (
    <div className="time-charts">
      <Panel name="Sun" color={SUN_COLOR} s={doc.series.sun} times={doc.series.time_utc} />
      <Panel name="Earth" color={EARTH_COLOR} s={doc.series.earth} times={doc.series.time_utc} />
      <p className="fine">
        Colored line: Sun or Earth Elevation. Gray line: the Horizon Elevation at that body's azimuth (the terrain
        under it). Green: in Line of Sight. Red: blocked by terrain. Dates are UTC (MM-DD).
      </p>
    </div>
  );
}
