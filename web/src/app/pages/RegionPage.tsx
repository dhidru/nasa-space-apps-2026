/** Region page: hillshade map, Landing Time picker, coverage heatmap, top-10 list and site view (design.md §7). */
import { useEffect, useMemo, useRef, useState } from "react";
import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
import type { FeatureLike } from "ol/Feature";
import { boundingExtent } from "ol/extent";
import { LunarMap } from "../components/LunarMap";
import { LandingTimePicker } from "../components/LandingTimePicker";
import { SiteView } from "../components/SiteView";
import { basemapImageUrl, getJson, type BasemapDoc, type OutlineDoc, type RegionInfo, type RegionsDoc, type SitesGrid } from "../siteData";
import { useAsync } from "../useAsync";
import { coverageColor, coverageLabel, FULL_HIGH, PARTIAL_HIGH, PARTIAL_LOW, rgb } from "../coverage";
import type { Route } from "../route";
import { science } from "../../science/client";
import type { RankingDoc, RankingEntry } from "../../science/results";
import { formatUtc } from "../../science/time";

type RegionRoute = Extract<Route, { page: "region" }>;

interface Loaded {
  info: RegionInfo;
  basemap: BasemapDoc;
  outline: OutlineDoc;
  grid?: SitesGrid;
}

async function load(regionId: string): Promise<Loaded> {
  const regions = await getJson<RegionsDoc>("regions.json");
  const info = regions.regions.find((r) => r.id === regionId);
  if (!info) throw new Error(`There is no Landing Region "${regionId}".`);
  const [basemap, outline, grid] = await Promise.all([
    getJson<BasemapDoc>(info.basemap),
    getJson<OutlineDoc>(info.outline),
    info.has_site_data ? getJson<SitesGrid>(`regions/${regionId}/sites.json`) : undefined,
  ]);
  return { info, basemap, outline, grid };
}

export function RegionPage({ route, go }: { route: RegionRoute; go: (r: Route, replace?: boolean) => void }) {
  const state = useAsync(() => load(route.regionId), [route.regionId]);
  if (!state || state.status === "loading") return <p className="status">Loading the region…</p>;
  if (state.status === "error") return <p className="status error">{state.error.message} <a href="#/">Back to all regions</a></p>;
  return <Region data={state.value} route={route} go={go} />;
}

function useRanking(regionId: string, landing: number, enabled: boolean) {
  const [progress, setProgress] = useState(0);
  const state = useAsync(() => {
    if (!enabled) return undefined;
    setProgress(0);
    return science.ranking(regionId, landing, setProgress);
  }, [regionId, landing, enabled]);
  return { state, progress };
}

function Region({ data, route, go }: { data: Loaded; route: RegionRoute; go: (r: Route, replace?: boolean) => void }) {
  const { info, grid } = data;
  const { state: ranking, progress } = useRanking(info.id, route.landing, !!grid);
  const doc = ranking?.status === "done" ? ranking.value : undefined;
  const [hover, setHover] = useState<string>();
  const setLanding = (landing: number) => go({ ...route, landing }, true);
  const select = (siteId?: string) => go({ ...route, siteId });

  const outlinePts = data.outline.features[0].geometry.coordinates[0] as [number, number][];
  const heat = useHeatmap(grid, doc, route.siteId);
  const outlineLayer = useMemo(
    () => new VectorLayer({
      source: new VectorSource({ features: [new Feature(new Polygon([outlinePts]))] }),
      style: new Style({ stroke: new Stroke({ color: "#5fd3ff", width: 2, lineDash: [6, 4] }) }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.outline],
  );
  const entries = useMemo(() => new Map(doc?.sites.map((s) => [s.site_id, s])), [doc]);
  const top = useMemo(() => doc?.sites.filter((s) => s.top) ?? [], [doc]);
  const hovered = hover ? entries.get(hover) : undefined;

  return (
    <div className="region">
      <nav className="crumbs">
        <a href="#/">All regions</a> › <strong>{info.display_name}</strong>
      </nav>
      <div className="region-top">
        <section className="region-map">
          <LunarMap
            imageUrl={basemapImageUrl(info.basemap, data.basemap)}
            imageExtent={data.basemap.extent_m}
            fitExtent={boundingExtent(outlinePts)}
            layers={heat ? [heat, outlineLayer] : [outlineLayer]}
            attribution={data.basemap.source}
            onFeatureClick={(f: FeatureLike | undefined) => f?.get("siteId") && select(f.get("siteId"))}
            onFeatureHover={(f: FeatureLike | undefined) => setHover(f?.get("siteId"))}
          />
          {hovered && (
            <div className="hover-card">
              <strong>{hovered.site_id}</strong> · rank {hovered.rank} · {coverageLabel(hovered)}
            </div>
          )}
        </section>
        <aside className="panel">
          <h1>{info.display_name}</h1>
          {!grid ? (
            <div className="banner">Site analysis for this region is coming soon.</div>
          ) : (
            <>
              <LandingTimePicker value={route.landing} onChange={setLanding} />
              <Legend />
              <RankingStatus state={ranking} progress={progress} />
              {doc && <TopList top={top} doc={doc} selected={route.siteId} onSelect={select} />}
            </>
          )}
        </aside>
      </div>
      {grid && route.siteId && (
        <SiteView
          key={route.siteId}
          regionId={info.id}
          landing={route.landing}
          siteId={route.siteId}
          entry={entries.get(route.siteId)}
          onLandingTime={setLanding}
          onClose={() => select(undefined)}
        />
      )}
    </div>
  );
}

/** Square cells (grid spacing wide) colored by coverage; the top 10 get a white outline and their number. */
function useHeatmap(grid: SitesGrid | undefined, doc: RankingDoc | undefined, selected: string | undefined) {
  const state = useRef<{ entries: Map<string, RankingEntry>; topRank: Map<string, number>; selected?: string }>({
    entries: new Map(), topRank: new Map(),
  });
  const layer = useMemo(() => {
    if (!grid) return undefined;
    const h = grid.grid_spacing_m / 2;
    const features = grid.sites.map((s) => {
      const f = new Feature(new Polygon([[[s.x_m - h, s.y_m - h], [s.x_m + h, s.y_m - h], [s.x_m + h, s.y_m + h], [s.x_m - h, s.y_m + h], [s.x_m - h, s.y_m - h]]]));
      f.set("siteId", s.site_id);
      return f;
    });
    const styles = new Map<string, Style>();
    return new VectorLayer({
      source: new VectorSource({ features }),
      opacity: 0.55,
      style: (f) => {
        const id = f.get("siteId") as string;
        const e = state.current.entries.get(id);
        const rank = state.current.topRank.get(id);
        const sel = state.current.selected === id;
        const color = e ? coverageColor(e) : "rgba(128,128,128,0.3)";
        if (rank === undefined && !sel) {
          let s = styles.get(color);
          // A hairline in the fill color hides the anti-aliasing seams between neighbouring cells.
          if (!s) styles.set(color, (s = new Style({ fill: new Fill({ color }), stroke: new Stroke({ color, width: 0.75 }) })));
          return s;
        }
        return new Style({
          fill: new Fill({ color }),
          stroke: new Stroke({ color: sel ? "#00e5ff" : "#fff", width: sel ? 4 : 3 }),
          zIndex: sel ? 3 : 2,
          text: rank === undefined ? undefined : new Text({
            text: String(rank), font: "700 13px system-ui, sans-serif", offsetY: -14,
            fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#000", width: 3 }),
          }),
        });
      },
    });
  }, [grid]);
  useEffect(() => {
    state.current.entries = new Map(doc?.sites.map((s) => [s.site_id, s]));
    state.current.topRank = new Map(doc?.sites.filter((s) => s.top).map((s, i) => [s.site_id, i + 1]));
    state.current.selected = selected;
    layer?.changed();
  }, [doc, selected, layer]);
  return layer;
}

function Legend() {
  return (
    <div className="legend">
      <span><i style={{ background: rgb(FULL_HIGH) }} /> Full coverage (darker = more Clearance)</span>
      <span><i style={{ background: rgb(PARTIAL_HIGH) }} /><i style={{ background: rgb(PARTIAL_LOW) }} /> Partial (by the weaker of Sun and Earth)</span>
      <span><i className="outlined" /> Top 10 (at least 2 km apart)</span>
    </div>
  );
}

function RankingStatus({ state, progress }: { state: ReturnType<typeof useAsync<RankingDoc>>; progress: number }) {
  if (!state || state.status === "done") return null;
  if (state.status === "error") return <p className="status error">{state.error.message}</p>;
  return (
    <p className="status">
      Scoring every Landing Site over the Surface Stay… {Math.round(progress * 100)} %
      <progress value={progress} max={1} />
    </p>
  );
}

function TopList({ top, doc, selected, onSelect }: { top: RankingEntry[]; doc: RankingDoc; selected?: string; onSelect: (id: string) => void }) {
  const nFull = doc.sites.filter((s) => s.coverage === "full").length;
  return (
    <div className="top-list">
      <h2>Top 10 Landing Sites</h2>
      <p className="fine">
        Surface Stay {formatUtc(Date.parse(doc.landing_time_utc)).slice(0, 16)} to {doc.stay_end_utc.slice(0, 16)} UTC.{" "}
        {nFull} of {doc.sites.length} sites have Full Coverage.
      </p>
      <ol>
        {top.map((s) => (
          <li key={s.site_id} className={s.site_id === selected ? "selected" : ""}>
            <button onClick={() => onSelect(s.site_id)}>
              <span className="swatch" style={{ background: coverageColor(s) }} />
              <span className="id">{s.site_id}</span>
              <span className="label">{coverageLabel(s)}</span>
              <span className="num" title="Worst-case min Clearance over the stay (Sun or Earth)">
                {s.worst_case_min_clearance_deg.toFixed(2)}°
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
