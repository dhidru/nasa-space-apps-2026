/** Site view: sky plot, Sun/Earth time charts, stats table and Landing Windows (design.md §7). */
import { science } from "../../science/client";
import type { RankingEntry, SiteDetailDoc } from "../../science/results";
import { useAsync } from "../useAsync";
import { coverageLabel } from "../coverage";
import { SkyPlot } from "./SkyPlot";
import { TimeCharts } from "./TimeCharts";
import { StatsTable } from "./StatsTable";
import { LandingWindowsPanel } from "./LandingWindowsPanel";

interface Props {
  regionId: string;
  landing: number;
  siteId: string;
  entry?: RankingEntry;
  onLandingTime: (t: number) => void;
  onClose: () => void;
}

export function SiteView({ regionId, landing, siteId, entry, onLandingTime, onClose }: Props) {
  const state = useAsync<SiteDetailDoc>(() => science.detail(regionId, landing, siteId), [regionId, landing, siteId]);
  return (
    <section className="site-view">
      <header>
        <h2>
          Landing Site {siteId}
          {entry && <span className="sub"> · rank {entry.rank} · {coverageLabel(entry)}</span>}
        </h2>
        <button className="close" onClick={onClose} aria-label="Close the site view">×</button>
      </header>
      {!state || state.status === "loading" ? (
        <p className="status">Computing the Sun and Earth over the Surface Stay…</p>
      ) : state.status === "error" ? (
        <p className="status error">{state.error.message}</p>
      ) : (
        <>
          <div className="site-grid">
            <div>
              <h3>Sky plot</h3>
              <SkyPlot doc={state.value} />
            </div>
            <div>
              <h3>Stats over the Surface Stay</h3>
              <StatsTable doc={state.value} />
            </div>
          </div>
          <h3>Sun and Earth Elevation over the Horizon</h3>
          <TimeCharts doc={state.value} />
        </>
      )}
      <LandingWindowsPanel regionId={regionId} siteId={siteId} landing={landing} onLandingTime={onLandingTime} />
    </section>
  );
}
