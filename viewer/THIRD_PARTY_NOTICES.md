# Third-party notices

This project's own code is MIT-licensed (see `LICENSE`). It uses the following.

## Runtime libraries (shipped in the deployed site)

| Component | License | Notes |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) 0.160.0 | MIT | 3D rendering of the site slice. |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 | MIT | Sun, Earth and Moon positions and the Moon's rotation. |

Run `npm run licenses` to print the current list.

## Code from this repository

| Component | License | Notes |
|---|---|---|
| Data loading, Clearance, ranking, coverage and route code (`../web/src/science`, `../web/src/app/coverage.ts`, `../web/src/app/route.ts`) and build plugins (`../web/scripts/vite-plugins.ts`) | Apache-2.0 (the repository's license) | Imported, not copied; bundled into the viewer's worker and main script. The Surface Stay panel (`src/stayview.js`) is a port of the web app's site-view components. |

## Build-time tools (not shipped)

| Tool | License |
|---|---|
| Vite | MIT |
| geotiff.js | MIT |
| pngjs | MIT |

## Data

| Data | Source | Status |
|---|---|---|
| Lunar elevation (`public/tiles/terrain`, `public/tiles/shadow-grid.png`) | NASA LRO Lunar Orbiter Laser Altimeter (LOLA), via the NASA Scientific Visualization Studio CGI Moon Kit (SVS #4720) | Public domain (SVS: "All of our content is in the public domain (unless otherwise noted)"). Credit: NASA's Scientific Visualization Studio. |
| Region DEMs (`public/tiles/polar`) | NASA LRO LOLA LDEM_80S_80M (PDS LRO-L-LOLA-4-GDR) | Public domain. |
| Regions, outlines, hillshades, site grid and heights, Horizons, Sun/Earth positions (`public/site-data`, copied from `data/processed/site-data`) | This repository's pipeline, from USGS outlines (CC0, doi:10.5066/P1MEQ6UK), LOLA LDEM_80S_20M/80M (public domain) and NAIF SPICE kernels (public domain) | See the repository's `ATTRIBUTIONS.md`. |
| CGI Moon Kit colour map (only with `prepare-data --with-color`, not shipped) | LROC WAC mosaic, Arizona State University, via SVS #4720 | ⚠️ License for the ASU-derived map not stated; not used. |

## Fonts

None. The interface uses the operating system's own fonts.
