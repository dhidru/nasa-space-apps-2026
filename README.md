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

_What we built, how it works, and why it matters._

## Demo

- **Live demo:** https://dhidru.github.io/nasa-space-apps-2026/
- **Project demo (video):** https://www.youtube.com/watch?v=kCesRBWED-E
- **Project repository:** https://github.com/dhidru/nasa-space-apps-2026/
- **Space Apps project page:** https://www.spaceappschallenge.org/2026/find-a-team/no-shade-with-a-side-of-ice/
  (the team's earlier name was "No Shade, With a Side of Ice")

## NASA Data & Resources Used

| Dataset / Resource | Source | How we used it |
| ------------------ | ------ | -------------- |
| _TBD_              | _TBD_  | _TBD_          |

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

We use Claude Code (Anthropic) as an AI coding assistant. Every AI contribution is
logged in the [AI usage log](ATTRIBUTIONS.md#ai-usage-log).

## License

[Apache License 2.0](LICENSE)
