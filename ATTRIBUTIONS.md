# Attributions, Licenses & Citations

Every external resource this project uses must be listed here **before** it is used.
That includes data, code, libraries, tools, AI assistants, images and media, and
information sources. Each entry records what it is, where we got it, what license
or permission lets us use it, and how to cite it.

## Rules

1. **Check the license or terms first.** Don't use a resource whose license is
   missing, unclear, or doesn't allow our use. Mark it ⚠️ and ask the team.
2. **Use primary sources.** Link to the official license or terms page, not a
   summary of it.
3. **Record the access date** for data and web sources, since they can change.
4. **Follow the license's requirements.** Examples: keep copyright notices, add
   NOTICE files, and cite datasets the way their provider asks.
5. **Disclose AI use.** Space Apps requires it. Record the tool and what it was
   used for, and note any AI-generated assets in the project submission.

### Status key

- ✅ Verified: license or terms checked and they allow our use
- ⚠️ Pending: not yet verified, or a question is open. Don't ship until resolved.
- ❌ Rejected: we can't use it. Kept here for the record.

### Entry template

```markdown
### <Resource name>
- **Type:** Data | Code/Library | Tool | AI | Media | Information
- **Used for:** <what we use it for and where in the repo>
- **Source:** <URL>
- **Accessed:** YYYY-MM-DD
- **License / permission:** <license name + link to official text or terms>
- **Requirements:** <attribution wording, notices to keep, restrictions>
- **Status:** ✅ / ⚠️ / ❌ (checked by <who>, YYYY-MM-DD)
- **Citation:** <formatted citation, using the provider's preferred format if given>
```

---

## Data

Each dataset below also has a conventions card in
[docs/data-contract.md §9](docs/data-contract.md#9-conventions-cards-for-source-datasets).

### USGS Down Selected Artemis III Candidate Landing Site Navigational Grids (region outlines only)
- **Type:** Data
- **Used for:** Outlines of the 9 Landing Regions (`regions.json`,
  `regions/<id>/outline.geojson`) and the area in which the pipeline places
  Landing Sites. We use only the file `A3_9regions-lonlat-simplified.zip`
  (637,136 bytes). We don't use the per-region navigational-grid zips.
- **Source:** https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 (DOI https://doi.org/10.5066/P1MEQ6UK).
  The release states that the region outlines were sourced from LROC QuickMap.
- **Accessed:** 2026-11-14
- **License / permission:** CC0 1.0. The ScienceBase "Rights" field says the work "is marked with Creative Commons Zero v1.0 Universal"
  (https://creativecommons.org/publicdomain/zero/1.0/). The FGDC metadata gives "None" for both use and access constraints.
- **Requirements:** None under CC0. We cite it anyway, as the release asks.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** McClernan, M.T., 2024, Down Selected Artemis III Candidate Landing Site Navigational Grids: U.S. Geological Survey data release, https://doi.org/10.5066/P1MEQ6UK.

### LRO LOLA Gridded Digital Elevation Models, south polar stereographic (PDS3 `LRO-L-LOLA-4-GDR-V1.0`)
- **Type:** Data
- **Used for:** Terrain for the Horizons, the site terrain heights and the
  hillshade base maps. Products used: `LDEM_80S_20M` (20 m/px, near field and region
  base map) and `LDEM_80S_80M` (80 m/px, far field and home base map), product
  version V2.0, created 2017-06-15.
- **Source:** NASA PDS Geosciences Node,
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
  (`ldem_80s_20m.img` 1,848,320,000 bytes, `ldem_80s_80m.img` 115,520,000 bytes, with their `.lbl` labels).
  Mission page: https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- **Accessed:** 2026-11-14
- **License / permission:** NASA open data. The NASA Planetary Science Division
  [Information and Data Management Policy](https://science.nasa.gov/wp-content/uploads/2023/05/PSDInformationDataManagementPolicy.pdf)
  (supplement to SPD-41A, 2023) requires that archives "make scientific information publicly available without fee or
  restriction of use". The PDS is the PSD archive. No product-specific restriction appears in the labels or the data set catalog.
- **Requirements:** Cite the data set, following [PDS3 citation guidance](https://pds.nasa.gov/datastandards/pds3/citing-pds3-data.shtml).
  Don't use NASA logos.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Neumann, G.A. (2010). *LRO Lunar Orbiter Laser Altimeter Gridded Digital Elevation Models*,
  LRO-L-LOLA-4-GDR-V1.0 [Data set]. NASA Planetary Data System. https://doi.org/10.17189/1520642.
  Products LDEM_80S_20M and LDEM_80S_80M (V2.0). The DOI comes from the PDS Geosciences DOI list; the
  author and year come from the data set catalog's CITATION_DESC.

### NAIF SPICE generic kernels (DE440 ephemeris, lunar orientation, leap seconds)
- **Type:** Data
- **Used for:** Sun and Earth positions in MOON_ME (`ephemeris/positions-<YYYY>.bin`), computed with SpiceyPy.
  Files: `spk/planets/de440s.bsp` (31 MB, covers 1849-12-26 to 2150-01-22),
  `pck/moon_pa_de440_200625.bpc` (12 MB), `fk/satellites/moon_de440_250416.tf` (19 KB),
  `lsk/naif0012.tls` (5 KB). We use `de440s.bsp` instead of the 114 MB `de440.bsp` because it has the
  same DE440 solution over a shorter span that covers ours.
- **Source:** https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- **Accessed:** 2026-11-14
- **License / permission:** [NAIF rules](https://naif.jpl.nasa.gov/naif/rules.html): kernels on the NAIF server
  "may be downloaded and used by anyone", and "Redistribution of SPICE kernels distributed by NAIF is permitted as long
  as they have not been modified." "No fees or licensing are required."
- **Requirements:** Don't modify the kernels. If we ever redistribute them, ship them unmodified. NAIF encourages
  acknowledging SPICE in publications and tools.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:**
  - Acton, C.H. (1996). Ancillary Data Services of NASA's Navigation and Ancillary Information Facility. *Planetary and Space Science*, 44(1), 65–70. https://doi.org/10.1016/0032-0633(95)00107-7
  - Acton, C., Bachman, N., Semenov, B., Wright, E. (2017). A look toward the future in the handling of space science mission geometry. *Planetary and Space Science*. https://doi.org/10.1016/j.pss.2017.02.013 (as listed on https://naif.jpl.nasa.gov/naif/credit.html)
  - Park, R.S., Folkner, W.M., Williams, J.G., Boggs, D.H. (2021). The JPL Planetary and Lunar Ephemerides DE440 and DE441. *The Astronomical Journal*, 161(3), 105. https://doi.org/10.3847/1538-3881/abd414

### NASA SVS CGI Moon Kit (global LOLA elevation map only)
- **Type:** Data
- **Used for:** The coarse global elevation tiles and shadow grid the viewer uses for its 3D terrain beyond the
  80 m region DEMs and for the far-horizon ray march (`web/scripts/prepare-data.mjs` → `web/public/tiles`, built at
  deploy time, not committed). File: `ldem_16.tif` (66 MB). We do **not** use the kit's colour map by default
  (see Requirements).
- **Source:** https://svs.gsfc.nasa.gov/4720
- **Accessed:** 2026-11-14
- **License / permission:** Public domain. The SVS help page (https://svs.gsfc.nasa.gov/help/) says "All of our
  content is in the public domain (unless otherwise noted)". The CGI Moon Kit page notes no exception.
- **Requirements:** The page asks: "Please give credit for this item to: NASA's Scientific Visualization Studio".
  The kit's colour map is adapted from the LROC WAC mosaic (Arizona State University) and its license isn't stated,
  so the viewer doesn't download or ship it (`prepare-data --with-color` builds it locally only).
- **Status:** ✅ elevation map (checked by Claude Code, 2026-11-14) · ⚠️ colour map: not used
- **Citation:** NASA's Scientific Visualization Studio (2019). *CGI Moon Kit* (ID 4720). Visualizer: Ernie Wright; scientist: Noah Petro. https://svs.gsfc.nasa.gov/4720

> NASA data is generally free to use, but check each dataset's own page. Some
> NASA-hosted data comes from partners (ESA, JAXA, commercial providers) under
> different terms. See [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
> and the [Space Apps data & resources page](https://www.spaceappschallenge.org/).
> NASA logos and insignia are **not** free to use.

## Code & Libraries

### jsonschema (Python), with its required dependencies
- **Type:** Code/Library (development dependency, in `requirements-dev.txt`)
- **Used for:** Checking data files against the data-contract schemas
  (`contract/validate.py`). Not part of the shipped app.
- **Source:** https://github.com/python-jsonschema/jsonschema (PyPI `jsonschema==4.26.0`)
- **Accessed:** 2026-11-14
- **License / permission:** All MIT. Each package's own LICENSE or COPYING file was read:
  - jsonschema: [COPYING](https://github.com/python-jsonschema/jsonschema/blob/main/COPYING), © 2013 Julian Berman
  - referencing: [COPYING](https://github.com/python-jsonschema/referencing/blob/main/COPYING), © 2022 Julian Berman
  - jsonschema-specifications: [COPYING](https://github.com/python-jsonschema/jsonschema-specifications/blob/main/COPYING), © 2022 Julian Berman. It also bundles JSON Schema meta-schemas under a BSD-3-style license, © 2022 JSON Schema Specification Authors.
  - rpds-py: [LICENSE](https://github.com/crate-py/rpds/blob/main/LICENSE), © 2023 Julian Berman
  - attrs: [LICENSE](https://github.com/python-attrs/attrs/blob/main/LICENSE), © 2015 Hynek Schlawack and the attrs contributors
  - typing_extensions: PSF-2.0. It's pulled in by `referencing`; checked from the installed package's license metadata and LICENSE file.
  All are permissive and compatible with Apache 2.0. We don't redistribute them, because pip installs them.
- **Requirements:** None while they're only installed with pip. If we ever vendor them, we must keep their notices.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Berman, J. *jsonschema* [Software, MIT License]. https://github.com/python-jsonschema/jsonschema

### NumPy
- **Type:** Code/Library (pipeline dependency, in `requirements.txt`)
- **Used for:** Arrays throughout the pipeline (`src/pipeline/`).
- **Source:** https://github.com/numpy/numpy (PyPI `numpy==2.5.4`)
- **Accessed:** 2026-11-14
- **License / permission:** BSD-3-Clause ([LICENSE.txt](https://github.com/numpy/numpy/blob/main/LICENSE.txt)), © 2005-2026 NumPy Developers.
  The Windows wheel also bundles OpenBLAS (BSD-3-Clause) and the gfortran runtime, which is
  "GPL-3.0-or-later WITH GCC-exception-3.1" (read from the installed `numpy-2.5.4.dist-info/licenses/LICENSE.txt`).
  The GCC Runtime Library Exception lets non-GPL programs use it, and we don't redistribute the wheel, so this is
  compatible with our Apache 2.0 license.
- **Requirements:** None while installed with pip.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Harris, C.R., Millman, K.J., van der Walt, S.J. et al. (2020). Array programming with NumPy. *Nature* 585, 357–362. https://doi.org/10.1038/s41586-020-2649-2

### SpiceyPy (with the bundled NAIF CSPICE Toolkit)
- **Type:** Code/Library (pipeline dependency, in `requirements.txt`)
- **Used for:** Reading the SPICE kernels and computing Sun and Earth positions (`src/pipeline/ephemeris.py`).
- **Source:** https://github.com/AndrewAnnex/SpiceyPy (PyPI `spiceypy==8.4.0`). The wheel contains `cspice.dll`.
- **Accessed:** 2026-11-14
- **License / permission:** SpiceyPy is MIT ([LICENSE](https://github.com/AndrewAnnex/SpiceyPy/blob/main/LICENSE)), © 2015-2024 Andrew Annex.
  The bundled CSPICE follows the [NAIF rules](https://naif.jpl.nasa.gov/naif/rules.html): "No fees or licensing are required",
  and using Toolkit modules inside a user-built tool is "entirely appropriate". Redistributing the unmodified Toolkit
  as a mirror needs NAIF's written clearance. We don't redistribute it, because pip installs it.
- **Requirements:** Don't vendor or mirror CSPICE. NAIF asks for acknowledgement (see the SPICE kernels entry above).
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Annex, A.M., Pearson, B., Seignovert, B. et al. (2020). SpiceyPy: a Pythonic Wrapper for the SPICE Toolkit. *Journal of Open Source Software*, 5(46), 2050. https://doi.org/10.21105/joss.02050

### Numba (with llvmlite)
- **Type:** Code/Library (pipeline dependency, in `requirements.txt`)
- **Used for:** Compiling the Horizon ray-marching loop (`src/pipeline/horizon.py`).
- **Source:** https://github.com/numba/numba (PyPI `numba==0.68.1`), https://github.com/numba/llvmlite (PyPI `llvmlite==0.50.0`)
- **Accessed:** 2026-11-14
- **License / permission:** Numba is BSD-2-Clause ([LICENSE](https://github.com/numba/numba/blob/main/LICENSE)), © 2012 Anaconda, Inc.
  llvmlite is "BSD-2-Clause AND Apache-2.0 WITH LLVM-exception" ([LICENSE](https://github.com/numba/llvmlite/blob/main/LICENSE)),
  © 2014 Anaconda Inc. The Apache-2.0 part covers the bundled LLVM.
- **Requirements:** None while installed with pip.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Lam, S.K., Pitrou, A., Seibert, S. (2015). Numba: a LLVM-based Python JIT compiler. *Proc. Second Workshop on the LLVM Compiler Infrastructure in HPC*. https://doi.org/10.1145/2833157.2833162

### pyshp
- **Type:** Code/Library (pipeline dependency, in `requirements.txt`)
- **Used for:** Reading the USGS region-outline shapefile (`src/pipeline/regions.py`).
- **Source:** https://github.com/GeospatialPython/pyshp (PyPI `pyshp==3.1.8`)
- **Accessed:** 2026-11-14
- **License / permission:** MIT ([LICENSE.TXT](https://github.com/GeospatialPython/pyshp/blob/master/LICENSE.TXT)), © 2013 Joel Lawhead. It has no runtime dependencies.
- **Requirements:** None while installed with pip.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Lawhead, J. *pyshp* [Software, MIT License]. https://github.com/GeospatialPython/pyshp

### pytest, with its required dependencies
- **Type:** Code/Library (development dependency, in `requirements-dev.txt`)
- **Used for:** Running the pipeline tests (`tests/`). Not part of the shipped app.
- **Source:** https://github.com/pytest-dev/pytest (PyPI `pytest==9.2.0`)
- **Accessed:** 2026-11-14
- **License / permission:** pytest is MIT ([LICENSE](https://github.com/pytest-dev/pytest/blob/main/LICENSE)), © 2004 Holger Krekel and others.
  Its required dependencies, from their PyPI and installed license metadata, are all permissive:
  iniconfig 2.3.1 (MIT), packaging 26.3 (Apache-2.0 OR BSD-2-Clause), pluggy 1.7.0 (MIT),
  Pygments 2.21.0 (BSD-2-Clause), and colorama 0.4.6 (BSD-3-Clause, Windows only).
- **Requirements:** None while installed with pip.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Krekel, H. et al. *pytest* [Software, MIT License]. https://github.com/pytest-dev/pytest

### Lunar Site Viewer front end (`web/`), with three.js and Astronomy Engine
- **Type:** Code/Library
- **Used for:** The web front end in `web/` (Vite + three.js + Astronomy Engine), built on the team's
  `data/processed/site-data` and deployed to GitHub Pages by `.github/workflows/pages.yml`. The viewer code was
  written by a team member with Claude, started from a Claude design chat; it is MIT-licensed (`web/LICENSE`),
  which is compatible with our Apache 2.0.
- **Source:** three.js https://github.com/mrdoob/three.js (npm `three@0.160.0`); Astronomy Engine
  https://github.com/cosinekitty/astronomy (npm `astronomy-engine@2.1.19`). Build-time only: Vite `5.4.11`,
  geotiff `2.1.3`, pngjs `7.0.0`.
- **Accessed:** 2026-11-14
- **License / permission:** All MIT, from each installed package's `package.json`. `npm run licenses` in `web/`
  lists the shipped tree (3 packages, all MIT).
- **Requirements:** Keep the MIT notices; the build keeps legal comments. Credits are in `web/THIRD_PARTY_NOTICES.md`.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** three.js authors. *three.js* [Software, MIT]. https://threejs.org/ · Cross, D. *Astronomy Engine* [Software, MIT]. https://github.com/cosinekitty/astronomy

## Tools

### Git
- **Type:** Tool
- **Used for:** Version control. Not distributed with the project.
- **Source:** https://git-scm.com/ (source: https://github.com/git/git)
- **Accessed:** 2026-11-14
- **License / permission:** GPL-2.0-only ([COPYING](https://github.com/git/git/blob/master/COPYING))
- **Requirements:** None for our use. We only run it and don't redistribute it.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Git project. *Git* [Software]. https://git-scm.com/

### GitHub CLI (`gh`)
- **Type:** Tool
- **Used for:** Creating the GitHub repo, managing collaborators, and fetching
  license templates. Not distributed with the project.
- **Source:** https://github.com/cli/cli
- **Accessed:** 2026-11-14
- **License / permission:** MIT ([LICENSE](https://github.com/cli/cli/blob/trunk/LICENSE))
- **Requirements:** None for our use. We only run it and don't redistribute it.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** GitHub, Inc. *GitHub CLI* [Software]. https://github.com/cli/cli

### Python 3.12 (CPython)
- **Type:** Tool
- **Used for:** Running the data pipeline, the mock data generator and the
  validator. Installed locally with winget from python.org. Not distributed
  with the project.
- **Source:** https://www.python.org/ (installer `python-3.12.10-amd64.exe`)
- **Accessed:** 2026-11-14
- **License / permission:** [PSF License Agreement](https://docs.python.org/3/license.html)
- **Requirements:** None for our use. We run it and don't redistribute it.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Python Software Foundation. *Python 3.12* [Software]. https://www.python.org/

### GitHub (hosting)
- **Type:** Tool
- **Used for:** Hosting this repository
- **Source:** https://github.com
- **Accessed:** 2026-11-14
- **License / permission:** [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
- **Requirements:** None for the project's content. We keep ownership of our code.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** GitHub, Inc. https://github.com

### GitHub Pages and GitHub Actions
- **Type:** Tool
- **Used for:** Building and hosting the static front end (`.github/workflows/pages.yml`, using the official
  `actions/checkout`, `actions/setup-node`, `actions/cache`, `actions/upload-pages-artifact` and
  `actions/deploy-pages`, all MIT). Being tested as a replacement for the viewer's earlier Vercel deployment.
- **Source:** https://docs.github.com/en/pages
- **Accessed:** 2026-11-14
- **License / permission:** [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
- **Requirements:** Pages sites on this plan are public.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** GitHub, Inc. *GitHub Pages*. https://pages.github.com/

### Matt Pocock's agent skills (`mattpocock-skills`)
- **Type:** Tool (Claude Code agent skills: Markdown instructions plus a few shell templates)
- **Used for:** Development workflow skills for Claude Code (grilling, spec and
  ticket flows, TDD, code review, domain modelling and more). We copied the 27
  skills listed in the upstream `.claude-plugin/plugin.json` into
  `.claude/skills/`, unmodified. We left out the upstream `in-progress/` and
  `misc/` skills. Developer tooling only, not part of the submitted app.
- **Source:** https://github.com/mattpocock/skills (commit `5863806dd4e15c63174bee4e7515a4256792ecfa`, 2026-11-12)
- **Accessed:** 2026-11-14
- **License / permission:** MIT ([LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE)), Copyright (c) 2026 Matt Pocock. MIT is compatible with our Apache 2.0 license. No other licenses were found in the copied files.
- **Requirements:** Keep the copyright and permission notice. A copy is at
  `.claude/skills/LICENSE-mattpocock-skills`.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Pocock, M. (2026). *mattpocock/skills: Agent skills for real engineering* [Software, MIT License]. https://github.com/mattpocock/skills

## AI Tools

### Claude Code (Anthropic)
- **Type:** AI
- **Used for:** Scaffolding the repository (README, .gitignore, folder layout),
  setting up GitHub, and writing this attributions file. Later uses are logged
  in the AI usage log below.
- **Source:** https://claude.com/claude-code
- **Accessed:** 2026-11-14
- **License / permission:** [Anthropic Terms](https://www.anthropic.com/legal). The team must confirm which terms apply to their account.
- **Requirements:** Disclose AI use in the Space Apps submission. Commits made
  with Claude carry a `Co-Authored-By: Claude` trailer.
- **Status:** ⚠️ The team should confirm the applicable Anthropic terms for their account.
- **Citation:** Anthropic. *Claude Code* [AI coding assistant], model Claude Opus 5.5. https://claude.com/claude-code

#### AI usage log

| Date | Tool | What it did | Files affected |
| ---- | ---- | ----------- | -------------- |
| 2026-11-14 | Claude Code | Created the repo scaffold, README template, .gitignore and folder layout | `README.md`, `.gitignore`, folders |
| 2026-11-14 | Claude Code | Switched the license to Apache 2.0 and created this attributions file | `LICENSE`, `ATTRIBUTIONS.md`, `CLAUDE.md` |
| 2026-11-14 | Claude Code | Added the "ask before pushing" rule to the project rules | `CLAUDE.md` |
| 2026-11-14 | Claude Code | Wrote the README challenge summary (paraphrased from the challenge page) and listed candidate resources | `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Verified the license of Matt Pocock's skills (MIT), copied 27 of them into the repo and recorded the attribution | `.claude/skills/`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Ran a design interview with the team, researched candidate data sources (not yet used), and wrote the glossary, the design doc and the "don't look at other teams' projects" rule | `GLOSSARY.md`, `docs/design.md`, `CLAUDE.md` |
| 2026-11-14 | Claude Code | Wrote the data contract, the JSON Schemas, the synthetic mock-data generator and the validator, then generated and validated the mock data | `docs/data-contract.md`, `contract/`, `requirements-dev.txt`, `.gitignore` |
| 2026-11-14 | Claude Code | Verified the licenses of the USGS outlines, LOLA DEMs, NAIF kernels and the pipeline libraries; wrote their attribution entries and conventions cards; wrote the first pipeline stages (projection, LOLA loader, region outlines, site grid, Horizon ray-marcher, ephemeris, build) with tests; downloaded the SPICE kernels and LOLA 80 m DEM | `ATTRIBUTIONS.md`, `docs/data-contract.md`, `src/pipeline/`, `tests/`, `pyproject.toml`, `requirements*.txt`, `README.md` |
| 2026-11-14 | Claude Code | Downloaded the USGS outlines (after the team solved the CAPTCHA), filled in their conventions card, switched the Demo Region to Mons Mouton at the team's request, regenerated the mock data, downloaded the 20 m DEM band and ran the first real build (6,400 sites) | `docs/`, `GLOSSARY.md`, `README.md`, `contract/mock/`, `src/pipeline/build.py`, `tests/test_build.py` |
| 2026-11-14 | Claude Code | Cut the time span to the Supported Span (2026-11-14 to 2027-11-14) at the team's request: Landing Windows now search that fixed span; updated the design doc, glossary, data contract, schema title, mock generator and README, and regenerated the mock Landing Windows | `docs/`, `GLOSSARY.md`, `README.md`, `contract/`, `src/pipeline/ephemeris.py` |
| 2026-11-14 | Claude Code | Measured Horizon compression options on the real data and, at the team's request, switched the Horizons to a delta-along-azimuth + gzip format (`horizons.bin.gz`, 18.4 → 3.7 MB): contract, schema, encoder/decoder with tests, build, mock generator and validator | `docs/`, `contract/`, `src/pipeline/`, `tests/`, `.gitignore` |
| 2026-11-14 | Claude Code | Un-ignored and committed the real pipeline output (`data/processed/site-data/`, ~11 MB) so the design side can use it, and noted it in the README | `.gitignore`, `README.md`, `data/processed/site-data/` |
| 2026-11-14 | Claude Code | Wrote the Clearance, metrics, ranking (2 km top 10) and Landing Windows code test-first, the results writer, and a real-data cross-check; built and validated the Mons Mouton results for 2027-03-01T00:00Z | `src/pipeline/clearance.py`, `src/pipeline/scoring.py`, `src/pipeline/results.py`, `tests/`, `data/processed/site-data/regions/mons-mouton/results/`, `README.md` |
| 2026-11-14 | Claude Code | Weighed static site vs. server using measured data sizes and wrote ADR 0001 (static site, clearance in the browser); updated the design doc and data contract to match | `docs/adr/`, `docs/design.md`, `docs/data-contract.md` |
| 2026-11-14 | Claude Code | Moved the Lunar Site Viewer (started from a Claude design chat, first hosted on Vercel) into `web/`; switched it to the team's site-data (regions, outlines, hillshades, `sites.json` heights, Horizons for Clearance, SPICE positions); fixed the overlapping-region lookup; made the unlicensed CGI Moon Kit colour map opt-in; added the GitHub Pages workflow; checked the viewer's Clearance against the pipeline's golden site detail | `web/`, `.github/workflows/pages.yml`, `ATTRIBUTIONS.md`, `README.md` |

## Media (images, icons, fonts, video, audio)

_None yet._

## Information Sources (articles, papers, docs, websites)

### Space Apps 2026 challenge: "Lunar Landing Site Navigator"
- **Type:** Information
- **Used for:** The problem statement. The README challenge summary is our own
  paraphrase, not copied text.
- **Source:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
  (the team provided the URL and page text; the site blocked an automated link check)
- **Accessed:** 2026-11-14
- **License / permission:** Challenge material provided to participants by NASA Space Apps
- **Requirements:** Paraphrase rather than copy, and link the original.
- **Status:** ✅ (paraphrased and linked; checked by Claude Code, 2026-11-14)
- **Citation:** NASA International Space Apps Challenge. "Lunar Landing Site Navigator." 2026 Challenges. https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

### NASA news release 24-136, "NASA Provides Update on Artemis III Moon Landing Regions" (2024-10-28)
- **Type:** Information
- **Used for:** The list and names of the 9 Landing Regions. `src/pipeline/regions.py` and the mock
  generator write its title and URL into `regions.json` → `source`. We use only the region names
  (facts) and a link; no text or images are copied.
- **Source:** https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- **Accessed:** 2026-11-14
- **License / permission:** NASA web content; see the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
  Region names are facts, and we link the release.
- **Requirements:** Don't use NASA logos or imply NASA endorsement.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** NASA (2024, October 28). *NASA Provides Update on Artemis III Moon Landing Regions* [News release 24-136]. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/

## Candidate Resources (not yet used, licenses not yet verified)

These are the resources the challenge suggests. Before any of them is used,
check its license or terms and move it to the right section above.

| Resource | Provider | What we might use it for | URL | Status |
| -------- | -------- | ------------------------ | --- | ------ |
| JPL Horizons System | NASA/JPL (Caltech) | Sun and Earth positions (azimuth and elevation) from lunar surface sites | https://ssd.jpl.nasa.gov/horizons/ | ⚠️ Not verified |
| LROC QuickMap | Arizona State University / LRO | Exploring terrain at south-pole sites | https://quickmap.lroc.asu.edu/ | ⚠️ Not verified |
| Moon Trek | NASA/JPL (Solar System Treks) | 3D terrain context and topography | https://trek.nasa.gov/moon/ | ⚠️ Not verified |
| LOLA topography (DEMs) | NASA GSFC / LRO, via PDS | Horizon profiles that include terrain | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | ✅ Adopted: see "Data" above |
| CSA Moon Exploration | Canadian Space Agency | Background and educational content | https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ | ⚠️ Not verified (Government of Canada content, which has its own terms) |

## Project License Text

### Apache License 2.0 text
- **Type:** Information
- **Used for:** `LICENSE` file
- **Source:** Apache Software Foundation, https://www.apache.org/licenses/LICENSE-2.0
  (retrieved through the GitHub Licenses API, `GET /licenses/apache-2.0`)
- **Accessed:** 2026-11-14
- **License / permission:** Anyone may copy and distribute the license text verbatim.
- **Requirements:** Don't modify the license text.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Apache Software Foundation. *Apache License, Version 2.0*, January 2004. https://www.apache.org/licenses/LICENSE-2.0
