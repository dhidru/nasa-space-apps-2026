# Lunar Site Viewer (viewer/)

The site's front end: a dashboard for choosing a landing site in NASA's nine Artemis III candidate regions near
the lunar south pole. It is published at the site root, https://dhidru.github.io/nasa-space-apps-2026/.

**Front end here, data and science from the team web app.** Everything the viewer knows about sites comes from the
web app's code in `../web/src` (see `docs/data-contract.md`, ADR 0001):

| What | Team code used |
|---|---|
| Serving the pipeline output (`data/processed/site-data`) under `<base>/data/`, without `results/` | `web/scripts/vite-plugins.ts` `siteData` (Vite plugin) |
| Reading files; sites and Horizons; Sun/Earth positions | `web/src/science` `fetchSiteData`, `readJson`, `loadRegion`, `loadPositions` |
| Sun/Earth azimuth, elevation and Clearance from a site | `web/src/science/geometry.ts` `track` |
| Ranking, top 10, site detail over the Surface Stay, Landing Windows | the web app's science worker (`web/src/science/worker.ts`) |
| Coverage labels and colours, Landing Time rules, link format | `web/src/app/coverage.ts`, `web/src/science/time.ts`, `web/src/app/route.ts` |
| Third-party notices in the build | `web/scripts/vite-plugins.ts` `thirdPartyNotices` |

The only data the viewer adds is NASA elevation for the 3D terrain (`scripts/prepare-data.mjs`).

## What it shows

1. **South pole map**: the team's hillshade with the nine regions. Hover a region to highlight it, click to open it.
2. **Region grid** (regions with site data; today Mons Mouton): a **Landing Time** picker for the 7-day Surface Stay,
   a **coverage heatmap** of every Landing Site, the **top 10** (at least 2 km apart) drawn and listed, and each
   cell's height, slope and rank on hover. Other regions show the grid with LOLA heights and a "coming soon" note.
3. **Site view**: a 3D slice of terrain (2 to 16 km) around the site (three.js, 80 m LOLA DEM), lit for any date and
   time, with the top-10 sites outlined. Around it:
   - Sun and Earth readouts with **Clearance** (from `track`), the site's rank, and a lunar-day timeline;
   - **Top 10 Landing Sites** for the chosen Landing Time;
   - **Surface Stay**: stats over the stay, sky plot, Sun and Earth elevation over the Horizon, and
     **Landing Windows** (click one to move to that Landing Time);
   - a table comparing the nine regions.

The Landing Time is the date and time in the site view, snapped to the 10-minute grid inside the Supported Span.
Links in the web app's format (`#/region/<id>?t=20270301T0000Z&site=r041c026`) open the same view here, and the
old `/viewer/` address redirects to the root.

The team's original web app (`../web/`) is still published at `/app/`, and its tests check the shared science
against the Python results on every deploy.

## Run it locally

```bash
npm install
npm run data         # downloads the NASA elevation files (~180 MB) and writes public/tiles (one-off, ~1 min)
npm run dev          # http://localhost:5173
```

If NASA's servers are blocked on your network, download the files by hand and pass them in:

```bash
npm run data -- --dem ldem_16.tif --lola80 ldem_80s_80m.img --lola80-label ldem_80s_80m.lbl
```

- `ldem_16.tif`: <https://svs.gsfc.nasa.gov/4720>
- `ldem_80s_80m.img` / `.lbl`: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/>

The CGI Moon Kit colour map is not downloaded by default: the viewer doesn't draw it, and the SVS page doesn't
state a license for that ASU-derived map. `npm run data -- --with-color` builds it if you need it locally.

## Deploy: GitHub Pages

`.github/workflows/pages.yml` runs the web app's tests, builds the web app, builds this folder with
`BASE_PATH=/<repo>/`, copies the web app into `dist/app/`, and publishes `dist/` on every push to `main`.
Pages sites are public.

To check a Pages build locally:

```bash
BASE_PATH=/nasa-space-apps-2026/ npm run build
npx vite preview --base /nasa-space-apps-2026/
```

(In Git Bash on Windows, prefix the build with `MSYS_NO_PATHCONV=1` so the path isn't rewritten.)

## Files

- `src/teamdata.js`: the data layer on the web app's code (regions, basemaps, sites, Horizons, positions, `track`).
- `src/ranking.js`: starts the web app's science worker on the same `data/` folder; ranking, detail, windows.
- `src/stayview.js`: the Surface Stay panel, plain-DOM ports of the web app's StatsTable, SkyPlot, TimeCharts and
  LandingWindowsPanel.
- `src/mapview.js`: the 2D maps (SVG in polar stereographic metres): home, region grid, heatmap, top 10.
- `src/patchview.js`: the 3D slice (three.js). `src/polar.js`: projection, the 200 m grid and region DEM loading.
- `src/metrics.js`, `src/chart.js`: the lunar-day timeline. `src/ephemeris.js`: Sun/Earth directions (team
  positions in 2026–2027, Astronomy Engine elsewhere).
- `scripts/prepare-data.mjs`: NASA elevation tiles for the 3D terrain, cut around the team's region outlines.
- `public/viewer/index.html`: redirect from the old `/viewer/` address.

If the science changes, change the Python first, then the web app's port (its parity tests must pass); the viewer
picks it up on its next build.

## Licence

The viewer's own code is MIT (see `LICENSE`), compatible with the repository's Apache-2.0; the team code it imports
is Apache-2.0. Third-party licences and data credits are in `THIRD_PARTY_NOTICES.md`, the build's
`THIRD-PARTY-NOTICES.txt` and the repository's `ATTRIBUTIONS.md`. `npm run licenses` audits the shipped npm packages.
