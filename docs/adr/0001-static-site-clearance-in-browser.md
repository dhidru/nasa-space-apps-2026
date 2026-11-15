---
status: accepted
---

# Static site on GitHub Pages; Clearance computed in the browser

We ship the tool as a static site on GitHub Pages. The browser builds the three
`results/` documents (data-contract §7) itself from `sites.json`,
`horizons.bin.gz` and `ephemeris/`, using a TypeScript port of the clearance and
ranking code. Python stays the reference implementation. There is no server.

## Why

- **We can't precompute every Landing Time.** The picker allows any 10-minute
  step in the Supported Span, which is 52,560 Landing Times. One ranking for Mons
  Mouton is about 4 MB, so precomputing them all would come to around 200 GB.
  Something has to compute results on demand, either a server or the browser.
- **The browser is fast enough.** One ranking is 6,400 sites × 1,009 samples ×
  2 bodies, about 13 million azimuth/elevation evaluations plus Horizon lookups.
  Measured on 2026-11-14, it takes about 1.5 s in a single thread (Node 24,
  after tuning the hot loop). That's acceptable with a progress bar. Splitting
  the sites across several workers is the next step if it needs to be faster.
  Landing Windows for one site cover about 53,600 samples, which take about
  0.2 s.
- **The port is small.** It's about 150 lines of numeric code:
  `local_az_el`, `horizon_elevation_at`, `body_stats`, `rank_sites`, `select_top`
  and `landing_windows` in `src/pipeline/clearance.py` and `scoring.py`.
- **There's nothing to be asleep or down during judging.** Free server tiers
  sleep, and the first request then takes 30–60 s. GitHub Pages is free and
  always on.
- **The download is acceptable.** It's a one-time load of about 6 MB per session:
  3.7 MB of Horizons and 1.26 MB per year of positions. We need one or two year
  files.

## Considered options

- **Python server** (FastAPI or similar on a free tier): one copy of the
  science code, but it adds a hosting dependency and a cold-start risk at the
  worst possible moment. We rejected it.
- **Precompute a coarse grid of Landing Times** (for example daily): this
  breaks the picker's 10-minute promise and is still about 1.5 GB per region
  per year. We rejected it.

## Consequences

- **The two copies can disagree.** This is the main risk. The results that
  `python -m pipeline.results` already commits under `results/` become golden
  fixtures. The TypeScript module has to reproduce them, with a tolerance on
  angles. A Coverage label or ranking position may only differ when the
  Clearance involved is within that tolerance of 0 (design.md §10 item 4).
  When the science changes, change Python first, regenerate the fixtures, then
  port.
- **Committed `results/` files are test fixtures, not served data.** The pages
  can still load the committed default Landing Time to show something on first
  paint.
- **The front end needs a Web Worker** for ranking and Landing Windows so the
  map stays responsive.
- **Publishing means copying `data/processed/site-data/` into the web build.**
  GitHub Pages serves `.gz` files without `Content-Encoding`, so the browser
  unpacks `horizons.bin.gz` itself, as data-contract §6.1 describes.
- **Adding a region costs about 4 MB of Horizons** on that region's page and
  nothing on the server side.
- **Values that don't depend on the Landing Time can be precomputed.** Timing
  Robustness covers every Landing Time in the Supported Span, which is too slow
  to compute per site in the browser. So `pipeline.robustness` stores it in
  `sites.json` (data-contract §5.3) and the browser only reads it. It has no
  TypeScript port, so it can't drift from the Python. Landing Slope works the
  same way (`pipeline.slope`); it needs the 20 m DEM, which the site doesn't ship.
  The browser only applies the slope limit when it picks the top 10. EVA
  Walkable Share comes from the same step and the same DEM.
