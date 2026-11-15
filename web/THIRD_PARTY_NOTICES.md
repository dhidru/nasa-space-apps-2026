# Third-party notices

This project's own code is MIT-licensed (see `LICENSE`). It uses the following.

## Runtime libraries (shipped in the deployed site)

| Component | License | Notes |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) 0.160.0 | MIT | 3D rendering of the site slice. |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 | MIT | Sun, Earth and Moon positions and the Moon's rotation. |

Run `npm run licenses` to print the current list.

## Build-time tools (not shipped)

| Tool | License |
|---|---|
| Vite | MIT |
| geotiff.js | MIT |
| pngjs | MIT |

## Data

| Data | Source | Status |
|---|---|---|
| Lunar elevation (`public/tiles/terrain`, `public/tiles/shadow-grid.png`) | NASA LRO Lunar Orbiter Laser Altimeter (LOLA), via the NASA Scientific Visualization Studio CGI Moon Kit (SVS #4720) | Public domain (US Government work). Credit: NASA's Goddard Space Flight Center. |
| South polar hillshade and region DEMs (`public/tiles/polar`) | NASA LRO LOLA LDEM_80S_80M (PDS LRO-L-LOLA-4-GDR) | Public domain. |
| Artemis III region outlines (`src/regions.js`) | USGS, doi:10.5066/P1MEQ6UK | CC0. |
| 200 m site grid convention; preview heights and 20 m hillshade (`preview/`) | dhidru/nasa-space-apps-2026 (team repository); LOLA LDEM_80S_20M | Apache-2.0 (code/design); NASA data public domain. |

## Fonts

None. The interface uses the operating system's own fonts.
