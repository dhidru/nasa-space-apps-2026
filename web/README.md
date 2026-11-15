# Lunar Site Viewer

A dashboard for choosing a landing site in NASA's nine Artemis III candidate regions near the lunar south pole.

1. **South pole map**: a 2D hillshade of the pole (NASA LOLA, 80 m) with the nine regions. Hover a region to
   highlight it, click to open it.
2. **Region grid**: the region split into the team's 200 m landing-site grid (site ids `r###c###` from the top-left,
   as in dhidru/nasa-space-apps-2026). Hover a cell to read its elevation and slope, click it to open the site.
3. **Site view**: a 3D slice of terrain (2 to 16 km) centred on the site, drawn with three.js from the 80 m LOLA DEM.
   Shade it with a relief light, real sunlight with cast shadows for any date and time, or slope classes. Around it:
   Sun and Earth readouts, a timeline of Sun and Earth elevation over one lunar day, and a table comparing the nine
   regions (sunlight, Earth visibility, longest darkness, slope). Click a cell in 3D to move to it.

Built with three.js (MIT) and Astronomy Engine (MIT); NASA and USGS data are public domain / CC0. No external
services, accounts or tokens at runtime.

## Run it locally

```bash
npm install
npm run data         # downloads the NASA maps (~290 MB) and writes public/tiles (one-off, ~1 min)
npm run dev          # http://localhost:5173
```

If NASA's servers are blocked on your network, download the files by hand and pass them in:

```bash
npm run data -- --dem ldem_16.tif --color lroc_color_poles_8k.tif --lola80 ldem_80s_80m.img --lola80-label ldem_80s_80m.lbl
```

- `ldem_16.tif`, `lroc_color_poles_8k.tif`: <https://svs.gsfc.nasa.gov/4720>
- `ldem_80s_80m.img` / `.lbl`: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/>

## Deploy to Vercel

Import the repository in Vercel; `vercel.json` sets the build. `npm run build` builds `public/tiles` only when it is
missing, so each Vercel build downloads the NASA files (about a minute). Keep the deployment private with Vercel
Authentication if the data or work is not ready to share.

## How it works

- `scripts/prepare-data.mjs`: global elevation tiles and a shadow grid from the CGI Moon Kit, plus the south polar
  hillshade and a cropped 80 m DEM per region from LOLA LDEM_80S_80M (`public/tiles/polar`).
- `src/mapview.js`: the 2D maps (SVG in polar stereographic metres). `src/polar.js`: projection, the 200 m site grid
  and region DEM loading.
- `src/patchview.js`: the 3D slice (three.js). Heights are bicubic-interpolated from the region DEM; sunlight uses a
  shadow map inside the slice, and the far horizon is checked separately over the global terrain.
- `src/metrics.js`, `src/chart.js`: Sun and Earth visibility over a lunar day and the timeline.
- `src/ephemeris.js`: Sun and Earth directions in the Moon's frame from Astronomy Engine.
- `preview/`: builds a standalone single-file preview of the 3D slice from the team's processed Mons Mouton data.

## Licence

MIT, see `LICENSE`. Third-party licences and data credits are in `THIRD_PARTY_NOTICES.md`; `npm run licenses` audits
the shipped dependency tree.
