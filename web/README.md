# Lunar Landing Site Navigator: web app (web/)

The static site at https://dhidru.github.io/nasa-space-apps-2026/ (ADR 0001). It ranks every Landing Site in a region
for a chosen Landing Time by whether the Sun and Earth stay in Line of Sight for the 7-day Surface Stay, and shows any
site in 3D. It reads the pipeline's output in `../data/processed/site-data` (see `docs/data-contract.md`).

## What it shows

1. **South pole map**: hillshade of the pole with the nine Artemis III regions; regions without site data are marked
   "coming soon". Hover a region to highlight it, click to open it.
2. **Region grid**: the 200 m Landing Site grid over the region's hillshade. With site data (every region except Mons Mouton Plateau):
   a **Landing Time** picker (−1 d / −1 h / +1 h / +1 d steps), a **coverage heatmap** of every site, the **top 10**
   (at least 2 km apart) drawn and listed, and each cell's height, slope and rank on hover.
3. **Site view**: a 3D slice of terrain (2 to 16 km) around the site (three.js, LOLA 80 m), shaded by relief, by
   sunlight with cast shadows at the chosen time, or by slope class, with the top-10 sites outlined. Around it:
   - Sun and Earth readouts with **Clearance**, the site's rank, a compass and a lunar-day timeline;
   - **Top 10 Landing Sites** for the Landing Time;
   - **Surface Stay**: stats over the stay, sky plot, Sun and Earth elevation over the Horizon, and **Landing
     Windows** (click one to move to that Landing Time);
   - a table comparing the nine regions, and spots you save in this browser.

Every view has a link that includes the Landing Time, e.g. `#/region/mons-mouton?t=20270301T0000Z&site=r041c026`.

## How it fits together

```
src/
├── science/   TypeScript port of the Python science (Clearance, ranking, Landing Windows) + parity tests;
│              client.ts runs it in a Web Worker; data.ts / horizons.ts / geometry.ts load and use the site data
├── app/       coverage.ts (labels, colours), route.ts (link format, default Landing Time)
└── ui/        the interface (MIT): main.js (views, readouts), mapview.js (SVG maps), patchview.js (3D),
               stayview.js (Surface Stay panel), teamdata.js (data via src/science), ranking.js (worker calls)
scripts/
├── vite-plugins.ts   serves site-data under /data/ (results/ left out) and writes THIRD-PARTY-NOTICES.txt
└── prepare-data.mjs  NASA elevation tiles for the 3D terrain (public/tiles)
```

Every number shown for a Landing Site comes from `src/science`: the readout's Clearance from `track()`, rankings,
site details and Landing Windows from the worker. The 3D terrain and the far-horizon check for regions without site
data use NASA elevation tiles; Astronomy Engine gives Sun/Earth directions outside 2026–2027.

## Run it

Needs Node.js 24.

```bash
npm install
npm run data         # NASA elevation tiles for the 3D view (~180 MB download, about a minute, once)
npm run dev          # http://localhost:5173
npm test             # TypeScript science vs. the committed Python results
npm run build        # typecheck, tiles if missing, static site in dist/
```

If NASA's servers are blocked on your network, download the files by hand and pass them in:

```bash
npm run data -- --dem ldem_16.tif --lola80 ldem_80s_80m.img --lola80-label ldem_80s_80m.lbl
```

- `ldem_16.tif`: <https://svs.gsfc.nasa.gov/4720>
- `ldem_80s_80m.img` / `.lbl`: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/>

The CGI Moon Kit colour map is not downloaded by default: the app doesn't draw it, and the SVS page doesn't state a
license for that ASU-derived map. `npm run data -- --with-color` builds it locally if you need it.

If the science changes, change the Python first, regenerate `results/`, then port the change. The parity tests in
`src/science/*.test.ts` fail until the two agree.

## Licence

The repository is Apache-2.0; the UI files in `src/ui` are MIT (`src/ui/LICENSE`), which is compatible. Third-party
licences and data credits: `THIRD_PARTY_NOTICES.md`, the build's `THIRD-PARTY-NOTICES.txt` and the repository's
`ATTRIBUTIONS.md`. `npm run licenses` lists the shipped npm packages.
