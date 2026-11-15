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

- **Live demo:** _TBD_
- **Video (30s max for judging):** _TBD_
- **Project page:** _TBD_

## NASA Data & Resources Used

| Dataset / Resource | Source | How we used it |
| ------------------ | ------ | -------------- |
| _TBD_              | _TBD_  | _TBD_          |

License checks and citations for every dataset, library, tool and source are
in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Tech Stack

_Languages, frameworks, libraries, tools._

## Getting Started

```bash
git clone https://github.com/dhidru/nasa-space-apps-2026.git
cd nasa-space-apps-2026
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt -r requirements-dev.txt   # macOS/Linux: .venv/bin/python
```

### Data pipeline (Demo Region: Mons Mouton)

**You don't need to run the pipeline to use the real data.** A built copy is
committed in `data/processed/site-data/` (about 11 MB): all 9 region outlines and
base maps, the Mons Mouton site grid and Horizons, and Sun/Earth positions for
the Supported Span. It has the same layout as the mock data in
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
4. `python -m pipeline.fetch lola20 mons-mouton`: only the rows of the LOLA 20 m DEM around the region (~100 MB).
5. `python -m pipeline.build`: regions, outlines, base maps, sites and Horizons into `data/processed/site-data/` (a few minutes).
6. `python -m pipeline.ephemeris ../data/processed/site-data/ephemeris 2026 2027`: Sun and Earth positions for the Supported Span.
7. `python -m pipeline.results --landing-time 2027-03-01T00:00:00Z`: Clearance, ranking, site details and
   Landing Windows into `regions/mons-mouton/results/` (seconds; repeat `--landing-time` for more).
8. `python ../contract/validate.py ../data/processed/site-data`: check the output against the data contract.

Tests: `pytest` runs the fast tests (seconds). `pytest -m slow` runs the checks that need the downloaded data.

## Repository Layout

```
src/            Application / analysis source code
data/raw/       Original downloaded datasets (large files git-ignored)
data/processed/ Pipeline output; site-data/ is committed for the front end
viewer/         Lunar Site Viewer (Vite + three.js, 3D terrain), reads site-data; see viewer/README.md
.github/        GitHub Pages workflow that builds and publishes viewer/
notebooks/      Exploration notebooks
docs/           Write-ups, diagrams, presentation material
assets/         Images, logos, media for the demo
ATTRIBUTIONS.md Licenses, permissions & citations for all external resources
CLAUDE.md       Project rules for the AI assistant (licensing & attribution)
```

## Team

| Name | Role |
| ---- | ---- |
| _TBD_ | _TBD_ |

## Use of AI

We use Claude Code (Anthropic) as an AI coding assistant. Every AI contribution is
logged in the [AI usage log](ATTRIBUTIONS.md#ai-usage-log).

## License

[Apache License 2.0](LICENSE)
