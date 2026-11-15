# Design: Lunar Landing Site Navigator

Status: agreed by the team on 2026-11-14 in a design interview with Claude Code.
Terms in **bold capitals** (Landing Region, Clearance, …) are defined in
[GLOSSARY.md](../GLOSSARY.md). The NASA sources behind these decisions, and the
criteria we don't cover yet, are in [landing-criteria.md](landing-criteria.md).

## 1. Purpose

A dashboard for mission planners of Artemis crewed south-polar landings. When
timelines slip, planners need to find new Landing Sites and Landing Times where
the Sun (power) and Earth (direct-to-Earth communication) both stay in Line of
Sight, taking the terrain into account, for the whole Surface Stay.

In the UI and the pitch, say "Artemis crewed south-polar landings". Don't name
a specific Artemis mission number.

## 2. Core user flows

1. **Pick a Landing Region.** The home page shows a map of the south polar region
   with all 9 Landing Regions outlined. All 9 look clickable.
2. **Pick a Landing Time.** The region page shows a map of that region only. The
   planner picks a Landing Time (UTC). We score every Landing Site over the
   Surface Stay [Landing Time, Landing Time + 7 days].
3. **Review the ranked sites.** We show a heatmap of all sites and a top-10 list.
   Clicking a site opens the site view.
4. **Find Landing Windows for a site (secondary).** For a chosen site, we scan
   every Landing Time in the Supported Span and list the best Landing Windows.
   The search always covers the whole span, so it can return dates before the
   chosen Landing Time or before today.

## 3. Landing Regions

- These are the 9 NASA candidate regions: Peak near Cabeus B, Haworth, Malapert
  Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de
  Gerlache Rim 2, and Slater Plain.
- The **Demo Region** is **Mons Mouton** (a 16 × 16 km square). We compute it
  first, and the demo uses it. On 2026-11-14 we ran the pipeline for the other
  7 regions that fit a static site, so 8 of the 9 have site data. Only Mons
  Mouton Plateau doesn't (see below).
- We first chose Mons Mouton Plateau, but its USGS outline turned out to be
  76.9 × 57.9 km (about 111,000 sites, a 320 MB Horizons file and about 50 min
  of compute). The team switched to Mons Mouton on 2026-11-14 because it fits
  the sizes below and sits right next to the plateau. The other regions are
  20–30 km squares, except the plateau.
- **Mons Mouton Plateau stays "coming soon"** (decided 2026-11-14). The other
  8 regions fit a static site. Each is at most about 13 MB of Horizons for
  Haworth, and only the open region is loaded. The plateau would be about
  63 MB of Horizons, or 320 MB unpacked, which is too much for one browser page.
  - We rejected filtering sites by the PGDA long-term average Sun and Earth
    maps. It's lossy: on Mons Mouton, the loosest threshold that kept every
    Full Coverage winner still kept 37% of sites. Also, the maps state no
    license.
  - If we revisit the plateau, split it into 20 tiles of 16 × 16 km, each the
    size of Mons Mouton. A coarse 800 m overview could later give a
    plateau-wide top 10.
- Regions without computed site data still open their region map, with a
  hillshade and outline. A banner says "Site analysis for this region is coming
  soon." The demo never shows a disabled or broken page.
- Region outlines come from the USGS Artemis III candidate navigational grids
  release (CC0, verified; see ATTRIBUTIONS.md).

## 4. Landing Sites

- A site is a circle with a **100 m radius**. NASA's 2022 release defines a
  site this way, and the landing accuracy is 100 m (landing-criteria.md §1).
- Site centers sit on a **200 m grid** inside the region, so neighboring circles
  touch but don't overlap. That's about 6,400 sites for Mons Mouton and about
  10,000 for a 20 km region.
- MVP: each site is scored at its center point, at an **Observer Height of 2 m**
  above the terrain.

## 5. Science model

### Horizon

- The Horizon is precomputed offline once per site. It depends only on the
  terrain, not on time.
- It has **1,440 azimuths (0.25° steps)**. The Sun moves about 0.5° of azimuth
  per hour, so 0.25° keeps narrow terrain features (for example, a 200 m ridge
  50 km away subtends about 0.23°) from being missed.
- Terrain: a LOLA polar stereographic DEM at **20 m within about 5 km** of the
  site, and **80 m out to about 150 km**. Beyond about 120 km, the Moon's
  curvature hides most terrain. The LOLA 80–90°S coverage reaches about 300 km
  from the pole, so it covers all regions, which lie within 6° of the pole.
- Fallback if time is short: use only the 80 m DEM first, then add the 20 m
  near field.
- The heavy computation (ray tracing about 6,400 sites × 1,440 azimuths) runs
  offline, for example with Numba. Build it end to end for Mons Mouton first.

### Sun and Earth positions

- Library: **SpiceyPy** with NASA NAIF kernels:
  - the **DE440** planetary ephemeris
  - **`moon_pa_de440`** for the Moon's orientation
  - the matching Moon frame kernel to rotate into **MOON_ME** (DE421-compatible,
    to match the LOLA and USGS products)
  - the NAIF leap-second kernel
- Effects included: the real orbit (eccentricity, inclination, perturbations),
  the Moon's axial tilt, physical libration, and optical libration (this falls
  out of the geometry).
- We use apparent positions, corrected for light time and stellar aberration.
- The observer is at the site's real 3D position (terrain height + 2 m), which
  captures Earth parallax of up to about 0.26° across the Moon.
- Not modeled: refraction (there's no atmosphere) and the sizes of the Sun and
  Earth disks. Line of Sight is judged at each body's **center**.
- Supported Span: Landing Times from **2026-11-14 to 2027-11-14** (decided by
  the team on 2026-11-14, cut down from 2026–2031 to keep the data small). The
  date picker only allows Landing Times in this span. The last Surface Stay ends
  on 2027-11-21, so positions are needed for 2026 and 2027 only. To move the
  span, change it in the data contract (§2) and rerun the pipeline.

### Sampling in time

- Use a **10-minute step**: about 1,008 samples per Surface Stay. In 10 minutes
  the Sun moves well under half of one 0.25° Horizon bin.
- The kernels can be evaluated at any instant, so this step is our choice, not a
  limit of the data.
- Event times (sunset, Earthset, durations) are accurate to ±10 min.

### Metrics per site, per body (Sun and Earth)

- Elevation: min, average, max (shown for context)
- **Clearance**: min, average, max (what we rank on and average)
- % of the Surface Stay in Line of Sight, and the total duration
- Time until the next loss of Line of Sight (sunset or Earthset)

Clearance matters more than raw elevation:
- At the pole the Sun is always low, and the vertical solar arrays there produce
  almost the same power at 1° as at 5°.
- Earth's distance barely changes with its elevation, so the radio link barely
  changes.
- What matters is whether terrain blocks the body, and by how much.

## 6. Ranking

1. **Full Coverage** sites first, then **Partial Coverage** sites.
2. Within Full Coverage: highest **worst-case Clearance** first, which is
   min(Sun min Clearance, Earth min Clearance). Ties are broken by average
   Clearance.
3. Within Partial Coverage: highest min(Sun % in Line of Sight, Earth % in Line
   of Sight) first.
4. Every site is labeled "Full coverage" or "Partial (Sun x %, Earth y %)".

**No combined score.** Extra factors (see stretch goals) appear as filters or
sortable columns. They are never folded into one weighted number.

### Top-10 list

Use greedy selection with a minimum separation of **2 km** (a setting):
1. Take the best-ranked site.
2. Remove every site within 2 km of it.
3. Repeat until there are 10 sites.

The heatmap still shows every site.

### Landing Windows (secondary feature)

- For one site, test every Landing Time in the Supported Span (2026-11-14 to
  2027-11-14) at the 10-minute step, whatever Landing Time is picked.
- A Landing Window is a run of consecutive Landing Times that all give Full
  Coverage.
- Merge windows separated by less than **24 hours** (a setting).
- Rank windows by the best worst-case Clearance inside each one, and show the
  top 10.

## 7. UI

### Home page

A map of the south polar region with a LOLA hillshade at 80 m and all 9 regions
outlined.

### Region page

- A region-only map with a LOLA hillshade at 20 m, cropped to the region.
- A Landing Time picker (UTC).
- A heatmap of sites colored by Full or Partial Coverage, with the top 10
  outlined.
- The top-10 list.

### Site view

- **Sky plot:** the site's 360° Horizon, with the Sun's and Earth's paths over
  the Surface Stay drawn on it. It's drawn as a panorama (azimuth across,
  elevation up), not a zenith-centered polar plot. Near the pole both bodies
  stay within a few degrees of the horizon, and a polar plot would squash
  them into its outer ring.
- **Time charts:** two stacked panels, **Sun in yellow** and **Earth in blue**.
  - Each panel shows the body's elevation line and the *terrain line under that
    body*: the Horizon Elevation at the body's azimuth at each moment.
  - The Sun and Earth sit at different azimuths, so each panel has its own
    terrain line.
  - The gap between the two lines is shaded green where the body is in Line of
    Sight and red where it is blocked.
- **Stats table:** the metrics from section 5 for each body.
- **"Find Landing Windows" button:** opens a color strip over the Supported Span
  (green = Full Coverage, amber = Partial, gray = outside the Supported Span) above the
  top-10 window list. Clicking a window sets the Landing Time.

## 8. Architecture

### Settled

- An **offline Python pipeline** turns the DEMs, USGS grids and SPICE kernels
  into the site grid, the Horizons, and the Sun and Earth positions.
- The clearance and ranking code is written in **Python first**. We need it for
  the pipeline, the tests and the Landing Windows anyway.
- The front end is built against a **results format** (section 9.3), not against
  the raw data files. That way the hosting decision below doesn't change the
  pages.
- The front end draws the polar stereographic maps as SVG in map metres and the site's
  terrain in 3D with three.js. (It started as a React + OpenLayers app; the two front ends
  were combined on 2026-11-14.) Check each library's license before adding it.

### Decided: static site, clearance in the browser

This was decided after the Mons Mouton pipeline worked. See
[ADR 0001](adr/0001-static-site-clearance-in-browser.md). The table below shows
the trade-off we weighed.

| | Static site (clearance in the browser) | Python server (clearance on a server) |
|---|---|---|
| Hosting | GitHub Pages: free and always on | Free tiers often sleep, so the first request can take 30–60 s |
| Science code | Python, plus a second TypeScript copy for the browser | One Python copy |
| Data sent to the browser | About 3.7 MB of Horizons per region (delta + gzip, data contract §6.1), plus about 2.6 MB of positions | Results only |
| Main risk | The two copies disagree (tests catch this) | The server is down or asleep during judging |

Precomputing the Sun and Earth positions is cheap in either case: 10-minute
steps come to about 1.3 MB per year, and the Supported Span needs two yearly
files (2026 and 2027).

## 9. Data contract

### 9.1 Conventions (every file we produce)

| Quantity | Convention |
|---|---|
| Body-fixed frame | MOON_ME (DE421-compatible) |
| Latitude | Planetocentric, −90 to +90°, south negative |
| Longitude | −180 to +180°, east positive (convert 0–360° sources on load) |
| Heights | Meters relative to the 1,737.4 km reference sphere (can be negative) |
| Map projection | South polar stereographic on the 1,737.4 km sphere. x/y in meters, origin at the pole |
| Azimuth | 0 to 360°, clockwise from local north. The Horizon lookup wraps across 360° → 0° |
| Elevation / Clearance | −90 to +90°. Negative Clearance means blocked |
| Local horizontal | The plane perpendicular to the line from the Moon's center through the site. It isn't tilted to match the local slope |
| Time | UTC, ISO 8601 (for example `2027-03-03T14:00:00Z`). SPICE uses TDB internally |

### 9.2 Conventions card per input dataset

Before a dataset is used, record a card that lists:
- the source frame
- the projection and its parameters
- units
- value ranges and sign conventions (for example 0–360° vs. −180–180°)
- resolution
- the reference height or datum
- the license (see ATTRIBUTIONS.md)

Check each card against the file's own metadata, not against memory. Each
dataset gets **one** conversion step on load, so nothing downstream ever sees a
foreign convention.

### 9.3 Files (formats to be detailed when building)

Pipeline outputs:
- Region outline (per region)
- Site grid: site id, x/y, lat/lon, terrain height
- Horizons: sites × 1,440 Horizon Elevations
- Sun and Earth positions over time, in MOON_ME

Results format (what the front end consumes):
- Ranked sites: id, coverage label, Clearance and elevation stats per body, % in
  Line of Sight, and top-10 membership
- Per-site time series: elevation and terrain-under-body for the Sun and Earth
- Landing Windows: start, end, best worst-case Clearance

**Mock data** in the results format will be generated when building starts, so
the design work doesn't wait on the pipeline.

## 10. Validation

1. **Done (2026-11-14).** Spot-check our flat-ground Sun and Earth
   azimuth/elevation with an independent code path. We use SPICE's own `azlcpo`
   routine instead of JPL Horizons, whose terms we haven't checked:
   `tests/test_validation_spice.py` compares 5 Mons Mouton sites at 25 times
   across the Supported Span and agrees to within 3e-5°.
   `tests/test_validation_orbit.py` checks the paths against Moon Fact Sheet
   values: the Sun's highest elevation, one turn of the sky per synodic month
   (east to west), Earth near the sub-Earth direction, Sun and Earth aligned at
   full moon and opposite at new moon, and the Earth-Moon distance.
2. **Blocked.** Compare our long-run % in sunlight against the published LOLA
   average-illumination maps (Mazarico et al. 2011). The PGDA data has no stated
   license (ATTRIBUTIONS.md), and the team decided on 2026-11-14 not to ask for
   permission, so we don't use it.
3. Round-trip tests: lat/lon → map x/y → lat/lon, and 0–360° ↔ −180–180°.
4. Python produces known answers (ADR 0001), and the
   TypeScript clearance module has to match them.

## 11. Team split

- **Data:** the pipeline, the conventions cards, the clearance and
  ranking code, and validation.
- **Design:** pages, maps and charts, built against the results format
  and mock data.
- Keep data and UI code in separate files and folders to avoid merge conflicts.

## 12. Stretch goals (unordered; the team picks the order)

- ~~Landing slope filter and column: NASA's limit is under 10° at the 100 m
  scale (landing-criteria.md §1–2).~~ Done: `pipeline.slope` stores each site's
  Landing Slope in `sites.json` (data-contract §5.3), computed from our 20 m DEM
  and checked against the LOLA slope map (landing-criteria.md §3). The top 10
  can be limited to sites under 10° or 8°.
- ~~EVA slope: the share of ground within 2 km that's under 20° (NASA's EVA
  limit, landing-criteria.md §2).~~ Done: `pipeline.slope` also stores each
  site's EVA Walkable Share in `sites.json` (data-contract §5.3); the map
  readout, the site overview and both top-10 lists show it.
- ~~Timing robustness column: the share of the Supported Span with Full
  Coverage (landing-criteria.md §2).~~ Done: `pipeline.robustness` stores it in
  `sites.json` (data-contract §5.3); the map readout, the site overview and both
  top-10 lists show it.
- Check every point in the 100 m circle, not just the center (the lander can
  touch down anywhere within 100 m of the target). Landing Slope already does
  this; Clearance is still judged at the center only.

## 13. Future development

Not planned for this challenge. We may add these afterwards.

- **Surface Stay length as a setting.** We use a fixed 7-day stay because it
  covers every Artemis surface stay NASA gives (5.75–6.5 days,
  landing-criteria.md §2 #7). A site with Full Coverage for 7 days also has it
  for any shorter stay that starts at the same Landing Time.
- **User-set Observer Height.** The Horizons are computed once for the 2 m
  Observer Height (data-contract §6.1), so any other height means computing
  them again in the pipeline.
- **Surface roughness and hazards.** The hazards that matter to a lander are
  meter-scale: boulders, small craters and holes. Our 20 m DEM can't see them,
  so a roughness value from it would only repeat what the 100 m Landing Slope
  already shows, and our sources give no Artemis roughness limit to check it
  against. Assessing hazards needs higher-resolution data, such as LROC NAC
  images or meter-scale DEMs, and a published limit for the Artemis landers.
- **Distance to the nearest permanently shadowed region** (PGDA LPSR
  shapefile), as a proxy for ice and science value (landing-criteria.md §2
  #10).
- **Fraction of the Sun's disk that is visible**, instead of judging Line of
  Sight at the Sun's center only (landing-criteria.md §1).

## 14. Rules that apply

- Before using any dataset, library or tool: verify its license and add an entry
  to ATTRIBUTIONS.md (see CLAUDE.md).
- Don't look at other teams' projects for this challenge (see CLAUDE.md).
