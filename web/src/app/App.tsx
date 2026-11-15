import { useCallback, useEffect, useState } from "react";
import { formatRoute, parseRoute, type Route } from "./route";
import { HomePage } from "./pages/HomePage";
import { RegionPage } from "./pages/RegionPage";

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((r: Route, replace = false) => {
    const hash = formatRoute(r);
    if (replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
    setRoute(r);
  }, []);

  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="brand">Lunar Landing Site Navigator</a>
        <span className="tagline">Sun and Earth Line of Sight for Artemis crewed south-polar landings</span>
      </header>
      <main>
        {route.page === "home" ? <HomePage go={go} /> : <RegionPage key={route.regionId} route={route} go={go} />}
      </main>
      <footer className="credits">
        Terrain: LOLA (NASA PDS) · Region outlines: USGS candidate landing regions (CC0) · Sun/Earth: NAIF SPICE
        kernels (NASA JPL) · <a href={`${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt`}>Third-party software notices</a> ·{" "}
        <a href="https://github.com/dhidru/nasa-space-apps-2026/blob/main/ATTRIBUTIONS.md">All attributions</a> · Not an official
        NASA product.
      </footer>
    </div>
  );
}
