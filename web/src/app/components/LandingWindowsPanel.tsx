/**
 * "Find Landing Windows": a coverage strip over the Supported Span (green = Full, amber = Partial,
 * gray = outside the span) above the top-10 window list. Clicking a window sets the Landing Time.
 */
import { useState } from "react";
import { science } from "../../science/client";
import type { LandingWindowsDoc } from "../../science/results";
import { DAY_MS, parseUtc, SPAN_END, SPAN_START } from "../../science/time";
import { useAsync } from "../useAsync";

const W = 720, H = 48, PAD = 6;

export function LandingWindowsPanel({ regionId, siteId, landing, onLandingTime }: { regionId: string; siteId: string; landing: number; onLandingTime: (t: number) => void }) {
  const [asked, setAsked] = useState(false);
  const state = useAsync<LandingWindowsDoc>(() => (asked ? science.windows(regionId, siteId) : undefined), [asked, regionId, siteId]);
  return (
    <div className="windows">
      <h3>Landing Windows</h3>
      {!asked ? (
        <button className="primary" onClick={() => setAsked(true)}>Find Landing Windows</button>
      ) : !state || state.status === "loading" ? (
        <p className="status">Checking every Landing Time in the Supported Span…</p>
      ) : state.status === "error" ? (
        <p className="status error">{state.error.message}</p>
      ) : (
        <Windows doc={state.value} landing={landing} onLandingTime={onLandingTime} />
      )}
    </div>
  );
}

function Windows({ doc, landing, onLandingTime }: { doc: LandingWindowsDoc; landing: number; onLandingTime: (t: number) => void }) {
  // A little gray margin either side marks "outside the Supported Span".
  const margin = 7 * DAY_MS;
  const t0 = SPAN_START - margin, t1 = SPAN_END + margin;
  const x = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD);
  const months = Array.from({ length: 13 }, (_, i) => Date.UTC(2026, 11 + i, 1)).filter((t) => t < SPAN_END);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart strip" role="img" aria-label="Coverage of every Landing Time in the Supported Span">
        <rect x={PAD} y={4} width={W - 2 * PAD} height={22} fill="#555" />
        {doc.strip.runs.map((r) => (
          <rect key={r.start_utc} x={x(parseUtc(r.start_utc))} y={4} height={22}
            width={Math.max(x(parseUtc(r.end_utc)) - x(parseUtc(r.start_utc)), 0.5)}
            fill={r.coverage === "full" ? "#2fae4a" : "#e0a030"} />
        ))}
        <line x1={x(landing)} x2={x(landing)} y1={0} y2={30} stroke="#fff" strokeWidth={2} />
        {months.map((t) => (
          <text key={t} x={x(t)} y={42} className="tick" textAnchor="middle">
            {new Date(t).toLocaleString("en", { month: "short", timeZone: "UTC" })}
          </text>
        ))}
      </svg>
      <p className="fine">Green: Full Coverage. Amber: Partial. Gray: outside the Supported Span. White line: current Landing Time.</p>
      {doc.windows.length === 0 ? (
        <p className="status">This site has no Landing Time with Full Coverage in the Supported Span.</p>
      ) : (
        <table className="windows-list">
          <thead>
            <tr><th>#</th><th>Window (UTC)</th><th>Length</th><th>Best Landing Time</th><th>Worst-case Clearance</th></tr>
          </thead>
          <tbody>
            {doc.windows.map((w) => (
              <tr key={w.rank} onClick={() => onLandingTime(parseUtc(w.best_landing_time_utc))} title="Set this Landing Time">
                <td>{w.rank}</td>
                <td>{w.start_utc.slice(0, 16).replace("T", " ")} → {w.end_utc.slice(0, 16).replace("T", " ")}{w.contains_partial_gaps ? " *" : ""}</td>
                <td>{w.duration_h < 48 ? `${w.duration_h.toFixed(1)} h` : `${(w.duration_h / 24).toFixed(1)} d`}</td>
                <td><button className="link">{w.best_landing_time_utc.slice(0, 16).replace("T", " ")}</button></td>
                <td>{w.best_worst_case_min_clearance_deg.toFixed(2)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {doc.windows.some((w) => w.contains_partial_gaps) && (
        <p className="fine">* Includes short Partial gaps (under {doc.merge_gap_h} h) that were merged into the window.</p>
      )}
    </>
  );
}
