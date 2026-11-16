# NASA Space Apps Challenge 2026: Lunar Landing Site Navigator

Our team's project for the [NASA International Space Apps Challenge 2026](https://www.spaceappschallenge.org/).

## Challenge

**Challenge name:** Lunar Landing Site Navigator
**Challenge link:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
**Difficulty:** Intermediate / Advanced
**Subjects:** Human Exploration, Moon, Software, Space Exploration

Missions to the Moon's south pole have hard limits on lighting and communication.
Small changes in landing site or date can change how much sunlight reaches the
solar arrays and whether Earth is above the horizon for direct-to-Earth
communication. Tools that compute these, such as JPL Horizons, LROC QuickMap and
Moon Trek, are powerful but hard to use for quick comparisons. The challenge is
to build an intuitive tool that lets mission planners, educators and the public
compare landing sites and dates quickly. It should show where the Sun and Earth
are relative to the local horizon, and give power and communication metrics such
as solar elevation, sunlight duration, Earth visibility windows, and time left
until sunset or Earthset.

## Our Solution

**What we built.** A web dashboard for planners of Artemis crewed south-polar
landings. It answers one question fast: *if we land here at this time, do the Sun
(power) and Earth (direct-to-Earth radio) stay above the terrain for the whole
7-day Surface Stay?* It runs in any browser, with nothing to install.

1. **Pick a Landing Region.** A map of the south pole shows all 9 NASA candidate
   regions. Eight have full site data. Mons Mouton Plateau is too large for a
   static site, so it shows its map with a "coming soon" note.
2. **Pick a Landing Time.** A calendar covers 2026-11-14 to 2027-11-14 and marks
   the days when no site keeps both the Sun and Earth in view all week. Every
   Landing Site in the region (a 100 m circle on a 200 m grid, about 6,400–10,000
   per region) is scored in seconds and shown as a heatmap with a top-10 list.
   The top 10 are kept at least 2 km apart.
3. **Inspect a site.** A 3D terrain view of the site, with an orientation map.
   A sky plot of the site's 360° horizon shows the Sun's and Earth's paths over
   the stay. Time charts show how far each body sits above the terrain under
   it, hour by hour. A verdict says whether the site has Full Coverage for the
   week. The site's slope, walkable ground and Timing Robustness are listed too.
4. **Find Landing Windows.** For one site, every Landing Time in the year is
   tested, and the best runs of dates with Full Coverage are listed.

**How it works.**
- **Horizons.** Offline, a Python pipeline ray-traces the horizon of every site
  in 1,440 directions (0.25° steps), using NASA LOLA elevation data: 20 m near
  the site and 80 m out to about 150 km. It takes the worst case over the center
  and four edge points of the 100 m landing circle, at 2 m above the ground.
- **Sun and Earth positions.** These come from NASA/JPL SPICE (DE440 ephemeris
  and the Moon's measured orientation) every 10 minutes. They include libration,
  light time and Earth parallax.
- **Ranking.** Sites with **Full Coverage** (Sun and Earth never blocked) come
  first, ranked by the lowest **Clearance** (how far the body sits above the
  terrain) of either body. Partial sites follow. There is no hidden combined
  score.
- **Slope and robustness.** Each site also gets its Landing Slope (NASA's limit
  is under 10°, checked against LOLA's own slope map), the share of ground
  within 2 km under 20° for walking (EVA), and Timing Robustness: how much of
  the year it has Full Coverage.
- **In the browser.** The clearance, ranking and Landing Windows code was ported
  to TypeScript and runs in Web Workers. Tests check it against the Python
  results, and the Python is checked against SPICE's own azimuth/elevation
  routine.

**Why it matters.** Near the south pole the Sun and Earth stay within a few
degrees of the horizon, so one ridge can cut power or communications for days.
When a launch slips, planners need new sites and dates fast. Tools like JPL
Horizons and LROC QuickMap can answer this one point at a time. This app
compares every site in a region at once and explains each result with the
terrain and sky geometry behind it.

## Demo

- **Live demo:** https://dhidru.github.io/nasa-space-apps-2026/
- **Project demo (video):** https://www.youtube.com/watch?v=kCesRBWED-E
- **Project repository:** https://github.com/dhidru/nasa-space-apps-2026/
- **Space Apps project page:** https://www.spaceappschallenge.org/2026/find-a-team/no-shade-with-a-side-of-ice/
  (the team's earlier name was "No Shade, With a Side of Ice")

## NASA Data & Resources Used

| Dataset / Resource | Source | How we used it |
| ------------------ | ------ | -------------- |
| LRO LOLA Gridded DEMs, south polar stereographic (`LDEM_80S_20M`, `LDEM_80S_80M`) | NASA PDS Geosciences Node ([LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm)) | Terrain for every site's Horizon, site heights, Landing Slope and EVA slope, and the map hillshades |
| LRO LOLA slope map (`LDSM_85S_40M`) | NASA PDS Geosciences Node | Test that checks our Landing Slope (not shipped) |
| NAIF SPICE generic kernels (DE440, `moon_pa_de440`, Moon frame, leap seconds) | NASA/JPL NAIF ([generic_kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/)) | Sun and Earth positions over the Supported Span, every 10 minutes |
| Down Selected Artemis III Candidate Landing Site Navigational Grids | USGS ScienceBase ([doi:10.5066/P1MEQ6UK](https://doi.org/10.5066/P1MEQ6UK)) | Outlines of the 9 candidate Landing Regions |
| CGI Moon Kit, global LOLA elevation map (`ldem_16.tif`) | NASA Scientific Visualization Studio ([SVS 4720](https://svs.gsfc.nasa.gov/4720)) | Distant terrain in the 3D view |
| NASA news releases 22-089 and 24-136, the Artemis HLS overview (NTRS 20250009323), LPSC abstracts and the NSSDCA Moon Fact Sheet | NASA, NTRS, LPI | Landing Site size, landing accuracy, slope limits, stay lengths and the candidate regions ([docs/landing-criteria.md](docs/landing-criteria.md)) |

License checks and citations for every dataset, library, tool and source are
in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Tech Stack

- **Data pipeline:** Python (NumPy, SpiceyPy, Numba), offline. See below.
- **Web app:** a static site (ADR [0001](docs/adr/0001-static-site-clearance-in-browser.md)) built with
  Vite, TypeScript and three.js: SVG maps of the pole and each region, and a 3D terrain view of each
  Landing Site. A TypeScript port of the clearance, ranking and Landing Windows code runs in a Web Worker,
  and tests check it against the Python results.

## Getting Started

```bash
git clone https://github.com/dhidru/nasa-space-apps-2026.git
cd nasa-space-apps-2026
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt -r requirements-dev.txt   # macOS/Linux: .venv/bin/python
```

### Data pipeline

**You don't need to run the pipeline to use the real data.** A built copy is
committed in `data/processed/site-data/` (about 83 MB): all 9 region outlines and
base maps, the site grids and Horizons of the 8 regions other than Mons Mouton
Plateau (design.md §3), and Sun/Earth positions for the Supported Span. It has the same layout as the mock data in
`contract/mock/data/`, including the `results/` documents for one Landing Time
(2027-03-01T00:00Z): the ranking, site details and Landing Windows for the top 10.
After a rebuild, commit the changed files there.

The source datasets go in `data/raw/` (git-ignored). Their licenses are in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md) and their conventions cards in
[docs/data-contract.md §9](docs/data-contract.md#9-conventions-cards-for-source-datasets).
Run these from `src/`:

1. Download `A3_9regions-lonlat-simplified.zip` by hand from the
   [USGS ScienceBase page](https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8)
   (it is behind a CAPTCHA) into `data/raw/usgs/`.
2. `python -m pipeline.fetch small`: SPICE kernels (~44 MB), and unzips the outlines.
3. `python -m pipeline.fetch lola80`: LOLA 80 m DEM (116 MB).
4. `python -m pipeline.fetch lola20 REGION_ID`, once for each of the 8 regions with site data (every region in
   `SITE_REGIONS` in `src/pipeline/build.py`): only the rows of the LOLA 20 m DEM around that region (~110 MB each).
5. `python -m pipeline.build`: regions, outlines, base maps, sites and Horizons into `data/processed/site-data/` (about 4 hours on an 8-region run, most of it Horizons for each site's center and edge points; Haworth alone is about 65 min).
6. `python -m pipeline.ephemeris ../data/processed/site-data/ephemeris 2026 2027`: Sun and Earth positions for the Supported Span.
7. `python -m pipeline.robustness`: Timing Robustness of every site, added to each region's `sites.json`
   (about 35 min for all 8 regions; `--region ID` for one). Rerun it after step 5, which rewrites `sites.json`.
8. `python -m pipeline.slope`: Landing Slope and EVA Walkable Share of every site, added to each region's
   `sites.json` (about 90 s for all 8 regions).
   Rerun it after step 5 too.
9. `python -m pipeline.results --landing-time 2027-03-01T00:00:00Z`: Clearance, ranking, site details and
   Landing Windows into `regions/mons-mouton/results/` (seconds; repeat `--landing-time` for more). These are
   the golden files for the TypeScript parity tests, so only the Demo Region (Mons Mouton) needs them.
10. `python ../contract/validate.py ../data/processed/site-data`: check the output against the data contract.

Tests: `pytest` runs the fast tests (seconds). `pytest -m slow` runs the checks that need the downloaded data,
including the validation against SPICE's own azimuth/elevation routine and known lunar orbit facts
(design.md §10), and the Landing Slope check against NASA's LOLA slope map (`python -m pipeline.fetch ldsm85`
first, 115 MB; docs/landing-criteria.md §3).

### Web app

Needs Node.js 24. It reads `data/processed/site-data/` directly. In dev it's served under
`/data/`, and the build copies it into `web/dist/data/`. The `results/` fixtures are left out
of the build, because the browser computes its own results. The 3D terrain view also needs NASA
elevation tiles, which `npm run data` downloads and cuts once (see [web/README.md](web/README.md)).

```bash
cd web
npm install
npm run data       # NASA elevation tiles for the 3D view (~180 MB download, about a minute, once)
npm run dev        # http://localhost:5173
npm test           # TypeScript science vs. the committed Python results (about 10 s)
npm run typecheck
npm run build      # static site in web/dist/, including THIRD-PARTY-NOTICES.txt (builds the tiles if missing)
```

If the science changes, change the Python first, regenerate `results/`, then port
the change. The parity tests in `web/src/science/*.test.ts` fail until the two agree.

### Publishing (GitHub Pages)

Every push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml):
it runs `npm test`, then `npm run build`, and publishes `web/dist/` to
https://dhidru.github.io/nasa-space-apps-2026/. You can also run it by hand from
the repo's **Actions** tab ("Deploy to GitHub Pages" → **Run workflow**). The app
uses relative paths and `#/` routes, so it works under the `/nasa-space-apps-2026/`
subpath without any extra config.

The workflow caches the NASA elevation files and tiles between runs.

This needs one repo setting, which is already on (checked 2026-11-14): **Settings →
Pages → Build and deployment → Source: GitHub Actions**. If the deploy job fails
with "Get Pages site failed" or "not found", a repo admin should check it again.

## Repository Layout

```
src/            Data pipeline (Python)
web/            Static web app: UI (maps, 3D terrain view) and the TypeScript science port; see web/README.md
data/raw/       Original downloaded datasets (large files git-ignored)
data/processed/ Pipeline output; site-data/ is committed for the front end
.github/        GitHub Pages workflow that tests, builds and publishes web/
docs/           Design doc, data contract, landing criteria, ADRs
ATTRIBUTIONS.md Licenses, permissions & citations for all external resources
CLAUDE.md       Project rules for the AI assistant (licensing & attribution)
```

## Team

**Hidden Planners**

| Name |
| ---- |
| Tsegai Hidru |
| Daniel Hidru |

## Use of AI

Space Apps allows AI tools but requires us to say where and how we used them.
Our AI tool was Anthropic's Claude: mostly Claude Code (model Claude Opus 5.5),
plus a Claude design chat for the first version of the web UI. The team chose
what to build, made the design and data decisions, and directed each change.
Every AI contribution is logged in the [AI usage log](ATTRIBUTIONS.md#ai-usage-log).

| Part of the project | AI involvement |
| ------------------- | -------------- |
| **Code:** data pipeline (`src/pipeline/`), tests (`tests/`), data contract and mock generator (`contract/`), web app (`web/`), build and deploy workflow (`.github/`) | **AI-generated.** Written by Claude Code at the team's request. The web UI in `web/src/ui/` started as a Claude design chat by a team member. Commits made with Claude Code carry a `Co-Authored-By: Claude` trailer. |
| **Data:** everything in `data/processed/site-data/` (Horizons, site grids, scores, base-map hillshades, Sun/Earth positions) | **Computed by AI-generated code** from NASA LOLA elevation data, NAIF SPICE kernels and USGS outlines. No values were made up by an AI model. Each data folder has an `AI-DISCLOSURE.txt` that says so, and it's published with the site at `data/AI-DISCLOSURE.txt`. |
| **Mock data:** `contract/mock/data/` | **AI-generated.** Synthetic test data from `contract/mock/generate_mock.py`, written by Claude Code. Every file is marked `"mock": true` and also has an `AI-DISCLOSURE.txt`. |
| **Text:** this README, `docs/`, `GLOSSARY.md`, `ATTRIBUTIONS.md` | **AI-generated.** Drafted by Claude Code from the team's decisions and from the cited NASA sources. |
| **Images:** the base-map PNGs | Hillshades computed from NASA LOLA measurements by the AI-written pipeline. They weren't made by an image-generation model. |
| **Audio and video** | None in this repository. |

The same disclosure is in the project's metadata: the `ai-disclosure` meta tag in
`web/index.html`, the `aiDisclosure` field in `web/package.json` and the
`[tool.ai-disclosure]` table in `pyproject.toml`.

No AI-generated content uses, contains or modifies NASA branding or design elements
(logos, insignia, flags or mission patches). The app mentions Artemis only in
plain text, as the name of the program whose candidate regions it shows.

## License

[Apache License 2.0](LICENSE)
