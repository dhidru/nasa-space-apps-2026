/** Home page: the south polar region with all 9 Landing Regions outlined (design.md §7). */
import { useMemo } from "react";
import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
import { boundingExtent, buffer } from "ol/extent";
import { LunarMap } from "../components/LunarMap";
import { basemapImageUrl, getJson, type BasemapDoc, type OutlineDoc, type RegionsDoc } from "../siteData";
import { useAsync } from "../useAsync";
import { DEFAULT_LANDING, type Route } from "../route";

interface Loaded {
  regions: RegionsDoc;
  basemap: BasemapDoc;
  outlines: OutlineDoc[];
}

async function load(): Promise<Loaded> {
  const [regions, basemap] = await Promise.all([getJson<RegionsDoc>("regions.json"), getJson<BasemapDoc>("home/basemap.json")]);
  const outlines = await Promise.all(regions.regions.map((r) => getJson<OutlineDoc>(r.outline)));
  return { regions, basemap, outlines };
}

export function HomePage({ go }: { go: (r: Route) => void }) {
  const state = useAsync(load, []);
  if (!state || state.status === "loading") return <p className="status">Loading the south polar map…</p>;
  if (state.status === "error") return <p className="status error">{state.error.message}</p>;
  return <HomeMap data={state.value} go={go} />;
}

function HomeMap({ data, go }: { data: Loaded; go: (r: Route) => void }) {
  const open = (regionId: string) => go({ page: "region", regionId, landing: DEFAULT_LANDING });
  const { layer, fit } = useMemo(() => {
    const features = data.regions.regions.map((r, i) => {
      const f = new Feature(new Polygon(data.outlines[i].features[0].geometry.coordinates));
      f.setProperties({ regionId: r.id, name: r.display_name });
      return f;
    });
    const style = (f: any) =>
      new Style({
        stroke: new Stroke({ color: "#5fd3ff", width: 2 }),
        fill: new Fill({ color: "rgba(95, 211, 255, 0.12)" }),
        text: new Text({
          text: f.get("name"), font: "600 13px system-ui, sans-serif", offsetY: -16, overflow: true,
          fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#000", width: 3 }),
        }),
      });
    const layer = new VectorLayer({ source: new VectorSource({ features }), style });
    const pts = data.outlines.flatMap((o) => o.features[0].geometry.coordinates[0]) as [number, number][];
    return { layer, fit: buffer(boundingExtent(pts), 20_000) };
  }, [data]);

  return (
    <div className="home">
      <section className="home-map">
        <LunarMap
          imageUrl={basemapImageUrl("home/basemap.json", data.basemap)}
          imageExtent={data.basemap.extent_m}
          fitExtent={fit}
          layers={[layer]}
          attribution={data.basemap.source}
          onFeatureClick={(f) => f && open(f.get("regionId"))}
        />
      </section>
      <aside className="panel">
        <h1>Pick a Landing Region</h1>
        <p>
          The nine candidate regions near the lunar south pole. Pick one, then a Landing Time, and every Landing Site is scored
          on whether the Sun and Earth stay in Line of Sight for the whole 7-day Surface Stay.
        </p>
        <ul className="region-list">
          {data.regions.regions.map((r) => (
            <li key={r.id}>
              <button onClick={() => open(r.id)}>
                {r.display_name}
                {!r.has_site_data && <span className="soon">coming soon</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="fine">
          Regions: <a href={data.regions.source.url}>{data.regions.source.name}</a>
        </p>
      </aside>
    </div>
  );
}
