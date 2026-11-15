/** The per-body metrics of design.md §5 for the Sun and Earth. */
import type { SiteDetailDoc, StatsDoc } from "../../science/results";
import { pct } from "../coverage";
import { HOUR_MS, parseUtc } from "../../science/time";

const deg = (v: number) => `${v.toFixed(2)}°`;

const utc = (s: string) => s.replace("T", " ").slice(0, 16) + " UTC";

function rows(landing: string): [string, (s: StatsDoc) => string][] {
  // design.md §5: the time until the next loss of Line of Sight (sunset or Earthset), from the Landing Time.
  const until = (s: StatsDoc) =>
    s.first_los_loss_utc === null
      ? "Never during the stay"
      : `${((parseUtc(s.first_los_loss_utc) - parseUtc(landing)) / HOUR_MS).toFixed(1)} h (${utc(s.first_los_loss_utc)})`;
  return [
  ["Min / mean / max Clearance", (s) => `${deg(s.min_clearance_deg)} / ${deg(s.mean_clearance_deg)} / ${deg(s.max_clearance_deg)}`],
  ["In Line of Sight", (s) => `${pct(s.los_fraction)} (${s.los_duration_h.toFixed(1)} h)`],
  ["Time until Line of Sight is lost", until],
  ["Min / mean / max Sun or Earth Elevation", (s) => `${deg(s.min_elevation_deg)} / ${deg(s.mean_elevation_deg)} / ${deg(s.max_elevation_deg)}`],
  ];
}

export function StatsTable({ doc }: { doc: SiteDetailDoc }) {
  return (
    <table className="stats">
      <thead>
        <tr><th /><th className="sun">Sun</th><th className="earth">Earth</th></tr>
      </thead>
      <tbody>
        {rows(doc.landing_time_utc).map(([label, f]) => (
          <tr key={label}><th>{label}</th><td>{f(doc.stats.sun)}</td><td>{f(doc.stats.earth)}</td></tr>
        ))}
        <tr>
          <th>Worst-case min Clearance</th>
          <td colSpan={2}>{deg(doc.worst_case_min_clearance_deg)} {doc.worst_case_min_clearance_deg > 0 ? "(both always in Line of Sight)" : "(negative = blocked at some point)"}</td>
        </tr>
      </tbody>
    </table>
  );
}
