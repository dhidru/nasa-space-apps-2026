# Lunar Site Viewer (viewer/)

A dashboard for choosing a landing site in NASA's nine Artemis III candidate regions near the lunar south pole.
It reads the team pipeline's output in `../data/processed/site-data` (see `docs/data-contract.md`).

This is a separate app from the team's main front end in `../web/` (React + the TypeScript science port). It
adds a 3D terrain slice and a lunar-day timeline; it is here to test hosting on GitHub Pages and to compare.

1. **South pole map**: the team's hillshade of the pole with the nine regions from `regions.json`. Hover a region
   to highlight it, click to open it.
2. **Region grid**: the region's 200 m Landing Site grid (ids `r###c###` from the top-left, as in `sites.json`) over
   the team's region hillshade. Hover a cell to read its elevation and slope, click it to open the site. In regions
   with team site data (today: Mons Mouton) the elevation comes from `sites.json`.
3. **Site view**: a 3D slice of terrain (2 to 16 km) around the site, drawn with three.js from the 80 m LOLA DEM.
   Shade it with a relief light, real sunlight with cast shadows for any date and time, or slope classes. Around it:
   Sun and Earth readouts, a timeline of Sun and Earth elevation over one lunar day, and a table comparing the nine
   regions. In regions with team site data, Sun and Earth visibility and the **Clearance** readout use the team's
   Horizons (`horizons.bin.gz`), so they match the pipeline's results.

## What comes from where

| Data | Source |
|---|---|
| Regions, outlines, home and region hillshades | team `site-data` (`regions.json`, `outline.geojson`, `basemap.*`) |
| Site heights, Horizons (Mons Mouton) | team `site-data` (`sites.json`, `horizons.bin.gz`) |
| Sun/Earth vectors, 2026–2027 | team `site-data/ephemeris` (SPICE, MOON_ME); Astronomy Engine outside those years |
| 3D terrain, slopes, far-horizon ray march where there are no team Horizons | NASA tiles built by `scripts/prepare-data.mjs` (LOLA 80 m polar DEM and the SVS CGI Moon Kit global DEM) |

`scripts/copy-site-data.mjs` copies `../data/processed/site-data` to `public/site-data` before every dev run and
build, so the repo copy stays the single source.

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

`.github/workflows/pages.yml` builds this folder and publishes `viewer/dist` to GitHub Pages on pushes to `main` that
touch `viewer/` or the site data, or by hand from the Actions tab. `BASE_PATH` sets the URL prefix (`/<repo>/`).
A repo admin has to set **Settings → Pages → Source: GitHub Actions** once. Pages sites are public.

To check a Pages build locally:

```bash
BASE_PATH=/nasa-space-apps-2026/ npm run build
npx vite preview --base /nasa-space-apps-2026/
```

(In Git Bash on Windows, prefix the build with `MSYS_NO_PATHCONV=1` so the path isn't rewritten.)

## How it works

- `src/teamdata.js`: loads the team's site-data (regions, basemaps, sites, Horizons, positions).
- `scripts/prepare-data.mjs`: global elevation tiles and a shadow grid from the CGI Moon Kit, plus a cropped 80 m
  DEM per region from LOLA LDEM_80S_80M (`public/tiles/polar`), cut around the team's region outlines.
- `src/mapview.js`: the 2D maps (SVG in polar stereographic metres). `src/polar.js`: projection, the 200 m site grid
  and region DEM loading.
- `src/patchview.js`: the 3D slice (three.js).
- `src/metrics.js`, `src/chart.js`: Sun and Earth visibility over a lunar day and the timeline.
- `src/ephemeris.js`: Sun and Earth directions in the Moon's frame (team positions, else Astronomy Engine).
- `preview/`: builds a standalone single-file preview of the 3D slice from the team's Mons Mouton data.

## Licence

The viewer's code is MIT (see `LICENSE`), which is compatible with the repository's Apache-2.0. Third-party
licences and data credits are in `THIRD_PARTY_NOTICES.md` and the repository's `ATTRIBUTIONS.md`;
`npm run licenses` audits the shipped dependency tree.
