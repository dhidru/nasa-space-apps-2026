# Third-party notices

Third-party software and data used by the web app. The UI files in `src/ui` are MIT-licensed (`src/ui/LICENSE`); the rest of the repository is Apache-2.0. The build also writes `THIRD-PARTY-NOTICES.txt` with every shipped package's license text.

## Runtime libraries (shipped in the deployed site)

| Component | License | Notes |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) 0.160.0 | MIT | 3D rendering of the site slice. |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 | MIT | Sun, Earth and Moon positions and the Moon's rotation. |

Run `npm run licenses` to print the current list.

## Build-time tools (not shipped)

| Tool | License |
|---|---|
| Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |
| geotiff.js | MIT |
| pngjs | MIT |

## Data

| Data | Source | Status |
|---|---|---|
| Lunar elevation (`public/tiles/terrain`, `public/tiles/shadow-grid.png`) | NASA LRO Lunar Orbiter Laser Altimeter (LOLA), via the NASA Scientific Visualization Studio CGI Moon Kit (SVS #4720) | Public domain (SVS: "All of our content is in the public domain (unless otherwise noted)"). Credit: NASA's Scientific Visualization Studio. |
| Region DEMs (`public/tiles/polar`) | NASA LRO LOLA LDEM_80S_80M (PDS LRO-L-LOLA-4-GDR) | Public domain. |
| Regions, outlines, hillshades, site grid and heights, Horizons, Sun/Earth positions (`dist/data`, served from `data/processed/site-data` by `scripts/vite-plugins.ts`) | This repository's pipeline, from USGS outlines (CC0, doi:10.5066/P1MEQ6UK), LOLA LDEM_80S_20M/80M (public domain) and NAIF SPICE kernels (public domain) | See the repository's `ATTRIBUTIONS.md`. |
| CGI Moon Kit colour map (only with `prepare-data --with-color`, not shipped) | LROC WAC mosaic, Arizona State University, via SVS #4720 | ⚠️ License for the ASU-derived map not stated; not used. |

## Fonts

None. The interface uses the operating system's own fonts.
