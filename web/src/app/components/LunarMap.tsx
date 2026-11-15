/**
 * An OpenLayers map in our south polar stereographic x/y meters (data-contract §2), with a hillshade
 * basemap placed by its extent (§5.5). Layers above the basemap are passed in by the page.
 */
import { useEffect, useRef } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import ImageLayer from "ol/layer/Image";
import ImageStatic from "ol/source/ImageStatic";
import Projection from "ol/proj/Projection";
import type BaseLayer from "ol/layer/Base";
import type { Extent } from "ol/extent";
import type { FeatureLike } from "ol/Feature";

export const LUNAR_SPS = new Projection({
  code: "lunar-south-polar-stereographic-m",
  units: "m",
  extent: [-304_000, -304_000, 304_000, 304_000],
});

interface Props {
  imageUrl: string;
  imageExtent: Extent;
  /** The area to show at first; the view stays inside the image. */
  fitExtent: Extent;
  layers: BaseLayer[];
  onFeatureClick?: (f: FeatureLike | undefined) => void;
  onFeatureHover?: (f: FeatureLike | undefined) => void;
  attribution: string;
}

export function LunarMap({ imageUrl, imageExtent, fitExtent, layers, onFeatureClick, onFeatureHover, attribution }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<OlMap>(undefined);
  const handlers = useRef({ onFeatureClick, onFeatureHover });
  handlers.current = { onFeatureClick, onFeatureHover };

  useEffect(() => {
    const basemap = new ImageLayer({
      source: new ImageStatic({ url: imageUrl, imageExtent, projection: LUNAR_SPS, interpolate: true, attributions: attribution }),
    });
    const m = new OlMap({
      target: el.current!,
      layers: [basemap, ...layers],
      view: new View({ projection: LUNAR_SPS, extent: imageExtent, constrainOnlyCenter: true, maxZoom: 22 }),
    });
    m.getView().fit(fitExtent, { padding: [24, 24, 24, 24] });
    m.on("singleclick", (ev) => handlers.current.onFeatureClick?.(m.forEachFeatureAtPixel(ev.pixel, (f) => f)));
    m.on("pointermove", (ev) => {
      if (ev.dragging) return;
      const f = m.forEachFeatureAtPixel(ev.pixel, (x) => x);
      const target = m.getTargetElement();
      if (target) target.style.cursor = f ? "pointer" : "";
      handlers.current.onFeatureHover?.(f);
    });
    map.current = m;
    return () => m.setTarget(undefined);
    // The layers are created once per page and updated through their sources and styles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  return <div ref={el} className="map" />;
}
