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
  version V2.0, created 2017-06-15. Also `LDSM_85S_40M` (40 m/px slope map, V2.0,
  created 2012-06-15), only to check our Landing Slope (`tests/test_slope_ldsm.py`);
  it isn't shipped. Its label shows the same data set and no other restriction.
- **Source:** NASA PDS Geosciences Node,
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
  (`ldem_80s_20m.img` 1,848,320,000 bytes, `ldem_80s_80m.img` 115,520,000 bytes, `ldsm_85s_40m.img`
  115,034,112 bytes, with their `.lbl` labels).
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
  Products LDEM_80S_20M and LDEM_80S_80M (V2.0), and LDSM_85S_40M (V2.0). The DOI comes from the PDS Geosciences DOI list; the
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

### React and React DOM (with scheduler)
- **Type:** Code/Library
- **Used for:** The first web front end's UI. **No longer used:** removed on 2026-11-14 when the two front ends were
  combined (the UI is now `web/src/ui`, without React). Kept here for the record.
- **Source:** https://github.com/facebook/react (npm `react`, `react-dom` 19.3.1; `scheduler` 0.28.0 comes with `react-dom`)
- **Accessed:** 2026-11-14
- **License / permission:** MIT ([LICENSE](https://github.com/facebook/react/blob/main/LICENSE)); checked in the installed packages' `package.json` and `LICENSE` files.
- **Requirements:** Keep the copyright and permission notice with copies. The build writes the full license text to `THIRD-PARTY-NOTICES.txt` (linked from the site footer), because minifying strips notice comments.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Meta Platforms, Inc. and affiliates. *React* [Software, MIT License]. https://react.dev

### OpenLayers (`ol`), with its runtime dependencies
- **Type:** Code/Library
- **Used for:** The first front end's home and region maps. **No longer used:** removed on 2026-11-14 when the two
  front ends were combined (the maps are now SVG in `web/src/ui/mapview.js`). Kept here for the record.
- **Source:** https://github.com/openlayers/openlayers (npm `ol` 10.11.0)
- **Accessed:** 2026-11-14
- **License / permission:** BSD 2-Clause, from the installed `node_modules/ol/LICENSE.md` ("Copyright 2005-present, OpenLayers Contributors"). Its runtime dependencies, from their installed `package.json` files, are all permissive: earcut, quickselect (ISC); fflate, geotiff, numcodecs, parse-headers, protocol-buffers-schema, quick-lru, rbush, reference-spec-reader, resolve-protobuf-schema, unzipit, zarrita (MIT); pako (MIT AND Zlib); pbf (BSD-3-Clause); zstddec (MIT AND BSD-3-Clause); lerc, web-worker (Apache-2.0); xml-utils (CC0-1.0). No GPL/AGPL.
- **Requirements:** Binary (minified) redistributions must reproduce the copyright notice, conditions and disclaimer in the documentation or other materials. `web/scripts/vite-plugins.ts` writes every runtime package's license text to `THIRD-PARTY-NOTICES.txt` in the build, linked from the footer.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** OpenLayers Contributors. *OpenLayers* [Software, BSD 2-Clause License]. https://openlayers.org

### Vite, Vitest, TypeScript and @types packages (build and test only)
- **Type:** Tool
- **Used for:** Building, serving and testing `web/`. Dev dependencies; not shipped in the site.
  (`@vitejs/plugin-react`, `@types/react` and `@types/react-dom` were removed with React on 2026-11-14.)
- **Source:** https://vite.dev (npm `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0), https://vitest.dev (`vitest` 5.1.0), https://www.typescriptlang.org (`typescript` 7.0.2), https://github.com/DefinitelyTyped/DefinitelyTyped (`@types/react`, `@types/react-dom`, `@types/node`)
- **Accessed:** 2026-11-14
- **License / permission:** Vite, plugin-react, Vitest and the @types packages: MIT. TypeScript: Apache-2.0. A scan of every installed package's `package.json` found MIT, Apache-2.0, ISC, BSD-2/3-Clause, CC0-1.0 and Zlib, plus `lightningcss` (MPL-2.0, Vite's CSS tool). MPL-2.0 is file-level copyleft; we run it unmodified and don't ship it, so it puts no terms on our code.
- **Requirements:** None for running them. We don't redistribute them.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Vite, Vitest and TypeScript contributors [Software]. https://vite.dev, https://vitest.dev, https://www.typescriptlang.org

### Web app UI (`web/src/ui`), with three.js and Astronomy Engine
- **Type:** Code/Library
- **Used for:** The site's UI in `web/src/ui` (maps, 3D terrain view, readouts, timeline, Surface Stay panel), running
  on the science code in `web/src/science`. The UI started as the Lunar Site Viewer, written by a team member with
  Claude from a Claude design chat; its files are MIT-licensed (`web/src/ui/LICENSE`), which is compatible with our
  Apache 2.0. three.js draws the 3D terrain; Astronomy Engine gives Sun/Earth directions outside 2026–2027.
- **Source:** three.js https://github.com/mrdoob/three.js (npm `three@0.160.0`); Astronomy Engine
  https://github.com/cosinekitty/astronomy (npm `astronomy-engine@2.1.19`). Build-time only (`web/scripts/prepare-data.mjs`):
  geotiff `2.1.3`, pngjs `7.0.0`.
- **Accessed:** 2026-11-14
- **License / permission:** All MIT, from each installed package's `package.json`. `npm run licenses` in `web/`
  lists the production tree (three, astronomy-engine; plus tslib 0BSD, an optional dependency of a build tool that
  is not bundled).
- **Requirements:** Keep the MIT notices; `THIRD-PARTY-NOTICES.txt` in the build carries the license texts.
  Credits are in `web/THIRD_PARTY_NOTICES.md`.
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

### Node.js 24 and npm
- **Type:** Tool
- **Used for:** Running the web build, dev server and tests. Not distributed with the project.
- **Source:** https://nodejs.org (v24.22.0, npm 11.19.1)
- **Accessed:** 2026-11-14
- **License / permission:** Node.js: MIT ([LICENSE](https://github.com/nodejs/node/blob/main/LICENSE)). npm: Artistic-2.0. We only run them.
- **Requirements:** None for our use.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** OpenJS Foundation. *Node.js* [Software]. https://nodejs.org

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

### GitHub Actions and GitHub Pages, with the official `actions/*` workflow actions
- **Type:** Tool
- **Used for:** Building, testing and publishing the web app to GitHub Pages
  (`.github/workflows/pages.yml`), a single app at the site root. The workflow references these actions by
  version; none of their code is copied into the repo or the site:
  `actions/checkout@v7` (v7.0.1), `actions/setup-node@v7` (v7.1.0),
  `actions/upload-pages-artifact@v5` (v5.0.0), `actions/deploy-pages@v5` (v5.0.1) and `actions/cache@v4`
  (caches the viewer's NASA elevation files between runs).
- **Source:** https://github.com/actions/checkout, https://github.com/actions/setup-node,
  https://github.com/actions/upload-pages-artifact, https://github.com/actions/deploy-pages,
  https://github.com/actions/cache;
  service: https://docs.github.com/en/pages
- **Accessed:** 2026-11-14
- **License / permission:** Each action is MIT ([checkout](https://github.com/actions/checkout/blob/main/LICENSE),
  [setup-node](https://github.com/actions/setup-node/blob/main/LICENSE),
  [upload-pages-artifact](https://github.com/actions/upload-pages-artifact/blob/main/LICENSE),
  [deploy-pages](https://github.com/actions/deploy-pages/blob/main/LICENSE),
  [cache](https://github.com/actions/cache/blob/main/LICENSE)).
  The Actions and Pages services fall under the
  [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
  and the [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
  (1 GB site, 100 GB/month soft bandwidth limit; about 42 MB with the 3D terrain tiles).
- **Requirements:** None for our use. We only run the actions on GitHub's
  runners and don't redistribute them. MIT is compatible with Apache 2.0.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** GitHub, Inc. *GitHub Actions* and *GitHub Pages*. https://github.com/features/actions, https://pages.github.com

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
| 2026-11-14 | Claude Code | Measured region data sizes, tested a long-term-average site filter on Mons Mouton and recorded the decision to keep Mons Mouton Plateau "coming soon" | `docs/design.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Checked the npm licenses; built the web front end (React + OpenLayers) and the TypeScript port of the clearance, ranking and Landing Windows code, test-first against the committed Python results; added the build plugins for site data and third-party notices | `web/`, `.claude/launch.json`, `docs/`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Checked the licenses of the official GitHub Actions; wrote the GitHub Pages deploy workflow (tests, build, publish) and checked the built site under the Pages subpath | `.github/workflows/pages.yml`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Moved the Lunar Site Viewer (started from a Claude design chat, first hosted on Vercel) into the repo; switched it to the team's site-data (regions, outlines, hillshades, `sites.json` heights, Horizons for Clearance, SPICE positions); fixed the overlapping-region lookup; made the unlicensed CGI Moon Kit colour map opt-in; added the GitHub Pages workflow; checked the viewer's Clearance against the pipeline's golden site detail | `viewer/`, `.github/workflows/pages.yml`, `ATTRIBUTIONS.md`, `README.md` |
| 2026-11-14 | Claude Code | Moved the Lunar Site Viewer from `web/` to `viewer/` so it sits beside the team's React front end, merged `main` and resolved the attribution conflicts | `viewer/`, `.github/workflows/pages.yml`, `ATTRIBUTIONS.md`, `README.md` |
| 2026-11-14 | Claude Code | Merged `main` again: dropped the viewer's separate Pages workflow and added the viewer build to the team's workflow, so it publishes under `/viewer/` on the same site | `.github/workflows/pages.yml`, `viewer/`, `ATTRIBUTIONS.md`, `README.md` |
| 2026-11-14 | Claude Code | Added the top 10 Landing Sites to the Lunar Site Viewer by reusing the web app's science worker and coverage helpers (no second copy of the science): Landing Time picker, top 10 on the region grid and in a list, rank readout, top-10 outlines in the 3D view; checked the top 10 against `results/ranking/20270301T0000Z.json` | `viewer/`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | At the team's request (no unlicensed data), validated our Sun/Earth azimuth and elevation against SPICE's own `azlcpo` routine and against Moon Fact Sheet values (tilt, synodic month, Earth distance, full/new moon); checked the fact sheet's terms | `tests/test_validation_spice.py`, `tests/test_validation_orbit.py`, `docs/design.md`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Combined the two front ends at the team's request: the Lunar Site Viewer is now the site's front end at the root, running on the web app's data and science code (siteData and notices plugins, fetchSiteData/readJson/loadRegion/loadPositions, track, the science worker, coverage and route helpers); ported the web app's coverage heatmap, stats table, sky plot, time charts and Landing Windows to the viewer; moved the web app to `/app/`; checked ranking, site detail and Landing Windows against the committed results | `viewer/`, `.github/workflows/pages.yml`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | At the team's request, merged the two front ends into one app in `web/` at the site root: the viewer's UI moved to `web/src/ui` on top of `web/src/science` (science client, loaders, track, worker); the React pages, React and OpenLayers were removed; added the web app's link format with the Landing Time, Landing Time step buttons, "coming soon" badges, name and footer links to the UI; one Pages build with nothing at `/viewer/` or `/app/`; checked ranking, site detail and Landing Windows against the committed results | `web/`, `viewer/` (removed), `.github/workflows/pages.yml`, `README.md`, `docs/`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Made the build use a separate LOLA 20 m band per region, downloaded the bands and computed sites and Horizons for the 7 remaining regions that fit a static site (all but Mons Mouton Plateau) | `src/pipeline/build.py`, `tests/test_build.py`, `data/processed/site-data/`, `docs/design.md`, `README.md`, `web/README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Smooth map-to-3D hand-off: the region map zooms onto the clicked Landing Site and clears the rest of the grid, then cross-fades into an overhead 3D view that tilts into the oblique camera while the relief rises | `web/src/ui/mapview.js`, `web/src/ui/patchview.js`, `web/src/ui/main.js`, `web/src/ui/map.css` |
| 2026-11-14 | Claude Code | Review fixes for the map-to-3D hand-off: no blank screen on back during loading, an error notice instead of a frozen map when the terrain fails to load, pan/zoom locked during the zoom, the map's last frame lined up with the 3D canvas, a longer overhead hold; shared helpers in a new transition module | `web/src/ui/transition.js`, `web/src/ui/mapview.js`, `web/src/ui/patchview.js`, `web/src/ui/main.js`, `web/src/ui/map.css`, `web/src/ui/style.css` |
| 2026-11-14 | Claude Code | Found and read NASA sources on Artemis landing requirements (two releases, the 2025 Space Apps HLS presentation, two LPSC abstracts, one of them provided by the team); mapped them to our design decisions, listed the criteria we don't cover yet, and corrected the "flat within 2 km" wording | `docs/landing-criteria.md`, `docs/design.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Added the Timing Robustness stretch goal: each site's share of Supported Span Landing Times with Full Coverage, computed once by a new `pipeline.robustness` step into `sites.json` (contract, schema, mock generator, glossary, ADR note), shown in the map readout, the site overview and both top-10 lists; tests in Python and TypeScript, two-axis code review | `src/pipeline/`, `tests/`, `contract/`, `data/processed/site-data/regions/*/sites.json`, `web/`, `docs/`, `GLOSSARY.md`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Added the EVA Walkable Share stretch goal (design.md's "EVA slope"): `pipeline.slope` also stores each site's EVA Walkable Share (share of the 2 km circle with a 100 m-scale slope under 20°) in `sites.json` (contract, schema, mock generator, glossary, ADR note), sharing the slope grid with Landing Slope, whose inside-the-DEM check now also catches circles cut off at the DEM edge; the web app shows it in the map readout, the site overview and both top-10 lists; tests in Python and TypeScript, two-axis code review | `src/pipeline/slope.py`, `tests/test_slope.py`, `contract/`, `data/processed/site-data/regions/*/sites.json`, `web/`, `docs/`, `GLOSSARY.md`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Follow-up from the EVA Walkable Share review: the top-10 list builder takes the region's team data once and draws its per-site columns (Year, Slope, EVA) from one table, instead of one accessor per value from each caller | `web/src/ui/toplist.js`, `web/src/ui/main.js`, `web/src/ui/mapview.js`, `web/src/ui/style.css`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Follow-ups from the Timing Robustness review: one shared top-10 list builder for the map card and the 3D view (`web/src/ui/toplist.js`), with escaped text and a column header (Site, Coverage over the stay, Worst, Year) on fixed-width columns; confirmed the MIT headers in `web/src/ui` are required by that code's license | `web/src/ui/toplist.js`, `web/src/ui/main.js`, `web/src/ui/mapview.js`, `web/src/ui/style.css`, `web/src/ui/map.css`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Added the landing slope stretch goal: compared NASA's LOLA slope map (LDSM_85S_40M) with slopes from our 20 m DEM for the team's choice of source; a new `pipeline.slope` step stores each site's Landing Slope (steepest 100 m-scale slope in its circle) in `sites.json` (contract, schema, mock generator, glossary, ADR note), a slow test checks it against LDSM, and the web app shows it and can limit the top 10 to sites under 10° or 8°; tests in Python and TypeScript, two-axis code review | `src/pipeline/`, `tests/`, `contract/`, `data/processed/site-data/regions/*/sites.json`, `web/`, `docs/`, `GLOSSARY.md`, `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Ranked the remaining stretch goals by ease and importance; at the team's request, moved the Surface Stay length setting and the user-set Observer Height out of the stretch goals into a new Future development section, and marked the variable stay length as covered by the 7-day stay | `docs/design.md`, `docs/landing-criteria.md`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | At the team's request, removed the in-app credits lines and cut long explanatory text in the map cards, site view, top-10 list, Surface Stay charts and status messages to short plain wording (sources stay credited in this file and THIRD-PARTY-NOTICES.txt) | `web/index.html`, `web/src/ui/mapview.js`, `web/src/ui/main.js`, `web/src/ui/stayview.js`, `web/src/ui/toplist.js`, `web/src/ui/map.css`, `web/src/ui/style.css` |
| 2026-11-15 | Claude Code | At the team's request: vertical exaggeration starts at 1×; the region map panel fits one screen without scrolling (paired readout, one-row time picker, two-column legend, slimmer top-10 rows without the coverage text, no back button); Top 10 sites in the 3D view drawn as filled squares with numbered tags | `web/index.html`, `web/src/ui/mapview.js`, `web/src/ui/map.css`, `web/src/ui/toplist.js`, `web/src/ui/patchview.js`, `web/src/ui/main.js` |
| 2026-11-15 | Claude Code | At the team's request, switched the web app to Source Sans 3 (text) and Merriweather (headings), self-hosted from @fontsource; checked both OFL-1.1 licences upstream and recorded them | `web/package.json`, `web/package-lock.json`, `web/src/ui/main.js`, `web/src/ui/style.css`, `web/src/ui/map.css`, `web/THIRD_PARTY_NOTICES.md`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | At the team's request: a "← back" button at the start of the breadcrumb on the region map and 3D views, Esc goes up one level, and the map-to-3D hand-off no longer pauses (shorter cross-fade, 3D motion starts at once) | `web/src/ui/mapview.js`, `web/src/ui/main.js`, `web/src/ui/patchview.js`, `web/src/ui/map.css` |
| 2026-11-15 | Claude Code | Explained how roughness is measured and how a limit is set; at the team's request, moved the roughness stretch goal to Future development, noting that boulders, small craters and holes need higher-resolution data than our 20 m DEM | `docs/design.md`, `docs/landing-criteria.md`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Region map: Landing Time pane at the top left (back button greyed until hover, calendar and hour/minute pickers, Clear); sites uncoloured until a time is picked; calendar blacks out days with no sunlight anywhere in the region (new dark-days worker job and test) | `web/index.html`, `web/src/ui/mapview.js`, `web/src/ui/map.css`, `web/src/ui/main.js`, `web/src/ui/ranking.js`, `web/src/science/darkness.ts`, `web/src/science/darkness.test.ts`, `web/src/science/{client,worker,protocol}.ts` |
| 2026-11-15 | Claude Code | Made dark days on the region-map calendar clickable (still shown black and struck through) with a warning note explaining the Sun stays below the terrain horizon at every site all day | `web/src/ui/mapview.js`, `web/src/ui/map.css` |
| 2026-11-15 | Claude Code | Home map: fixed (no zoom or pan, Reset view hidden); labelled latitude/longitude grid and a cursor lat/lon readout; a "Lunar South Pole" title over the map that scales with its size, and "South Pole" in the header title | `web/index.html`, `web/src/ui/mapview.js`, `web/src/ui/map.css` |
| 2026-11-15 | Claude Code | At the team's request: left pane for selection only (home: region list; region: back, Landing Time, Landing Slope), right pane for site data on region maps only; removed the map title overlay and enlarged the header title with the 80°–90° S line; made the lat/lon grid and labels clearly visible | `web/index.html`, `web/src/ui/mapview.js`, `web/src/ui/map.css` |
| 2026-11-15 | Claude Code | Region map: typed hour and minute fields (digits only, clamped, minutes rounded to 10, arrow keys step); calendar title opens a month view, then a year view; one fixed left-pane width (340 px) on every page | `web/src/ui/mapview.js`, `web/src/ui/map.css`, `web/src/ui/style.css` |
| 2026-11-15 | Claude Code | Region map starts with no Landing Time when opened from the home map; coverage heatmap blends into the terrain (hard-light) so topography stays visible; too-steep sites hatched; top-10 cells outline-only | `web/src/ui/mapview.js`, `web/src/ui/main.js`, `web/src/ui/map.css`, `web/src/ui/style.css` |
| 2026-11-15 | Claude Code | Redesigned the home map (Moon in a longitude bezel with a 0° Earth marker, automatic region-label placement, larger region list) and the region page (Landing Slope slider with a "No slope filter" option, calendar that crosses out No-Full-Stay Days and lights up the 7-day stay); wrote the No-Full-Stay Days computation and its tests | `web/index.html`, `web/src/ui/`, `web/src/science/fullstay*.ts`, `web/src/science/{worker,client,protocol}.ts`, `web/src/app/slope.ts`, `GLOSSARY.md` |
| 2026-11-15 | Claude Code | Renamed the mission in the app text to Artemis IV (source titles, dataset names and URLs left as published), set one 5 px gap between every home-map region name and its square, and removed the pickability notes from the calendar | `web/index.html`, `web/README.md`, `web/src/ui/` |
| 2026-11-15 | Claude Code | Switched every time to typed 24-hour hh:mm:ss UTC (no AM/PM), finished the Artemis IV renaming in our own wording, locked the 3D view's rotation, moved Shading and Slice into hover menus over the 3D view, limited the slope slider to 0–10° and made the site view's Top 10 collapsible | `web/index.html`, `web/src/ui/`, `web/src/app/utctime*.ts`, `web/src/app/slope.ts`, `web/scripts/prepare-data.mjs`, `docs/`, `ATTRIBUTIONS.md` |
| 2026-11-15 | Claude Code | Cut the 3D slice to the region outline, reduced the slope classes to <5°, 5–10° and >10°, and added a 0°-Earth-up orientation window to the 3D view | `web/index.html`, `web/src/ui/patchview.js`, `web/src/ui/inset.js`, `web/src/ui/main.js`, `web/src/ui/style.css` |
| 2026-11-15 | Claude Code | Turned off panning in the 3D view (scroll zooms only) and coloured the orientation window by slope class | `web/index.html`, `web/src/ui/patchview.js`, `web/src/ui/inset.js`, `web/src/ui/main.js`, `web/src/ui/style.css` |
| 2026-11-15 | Claude Code | Site view: green Full Coverage runs on the Landing Windows strip are clickable; Top 10 moved into a 3D-view menu next to "Slice around the site"; Max slope moved to the left pane; Date field gets an always-open calendar (shared with the region map, new calendar.js) and a grey yyyy-mm-dd mask while typing | `web/index.html`, `web/src/ui/main.js`, `web/src/ui/calendar.js`, `web/src/ui/mapview.js`, `web/src/ui/stayview.js`, `web/src/ui/style.css` |
| 2026-11-15 | Claude Code | Fixed the Shading and Slice menus closing on the click that follows the hover that opened them | `web/src/ui/viewmenu.js` |
| 2026-11-15 | Claude Code | First-time UX review; calendar scan moved to its own worker; region map opens at a precomputed Featured Landing Time per region | `web/src/science/client.ts`, `web/src/ui/ranking.js`, `web/src/ui/main.js`, `web/src/ui/mapview.js`, `web/src/ui/map.css`, `web/src/app/featured.ts` |
| 2026-11-15 | Claude Code | Applied UX review feedback: top-10 map badges open their exact site; pinned 7-day verdict card; Landing Windows in date order with a Best badge; rank-based site labels and timeline title | `web/index.html`, `web/src/ui/main.js`, `web/src/ui/mapview.js`, `web/src/ui/stayview.js`, `web/src/ui/map.css`, `web/src/ui/style.css` |

## Media (images, icons, fonts, video, audio)

### Source Sans 3 (font), via `@fontsource/source-sans-3` 5.3.1
- **Type:** Media
- **Used for:** All interface text in the web app (`--f-ui` in `web/src/ui/style.css`), weights 400, 600 and 700,
  self-hosted from the npm package (imported in `web/src/ui/main.js`). Source Sans 3 is Adobe's current name for
  Source Sans Pro, the same typeface.
- **Source:** https://github.com/adobe-fonts/source-sans (typeface); https://www.npmjs.com/package/@fontsource/source-sans-3 (package)
- **Accessed:** 2026-11-15
- **License / permission:** [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/)
  (upstream `LICENSE.md` in adobe-fonts/source-sans; the package's `license` field is `OFL-1.1`). The package has no dependencies.
- **Requirements:** Ship the copyright notice and licence text with the font files: the build writes both into
  `THIRD-PARTY-NOTICES.txt`. Don't sell the font by itself; a modified version can't use the reserved name "Source"
  (we don't modify it). OFL covers only the font files, so it doesn't affect the project's Apache-2.0 licence.
- **Status:** ✅ (checked by Claude Code, 2026-11-15)
- **Citation:** Adobe. *Source Sans 3* [typeface], with Reserved Font Name "Source". SIL Open Font License 1.1. https://github.com/adobe-fonts/source-sans

### Merriweather (font), via `@fontsource/merriweather` 5.3.0
- **Type:** Media
- **Used for:** Headings in the web app (`--f-head` in `web/src/ui/style.css`), weight 700, self-hosted from the
  npm package (imported in `web/src/ui/main.js`).
- **Source:** https://github.com/SorkinType/Merriweather (typeface); https://www.npmjs.com/package/@fontsource/merriweather (package)
- **Accessed:** 2026-11-15
- **License / permission:** [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/)
  (upstream `OFL.txt` in SorkinType/Merriweather; the package's `license` field is `OFL-1.1`). The package has no dependencies.
- **Requirements:** Ship the copyright notice and licence text with the font files: the build writes both into
  `THIRD-PARTY-NOTICES.txt`. Don't sell the font by itself; a modified version can't use the reserved name
  "Merriweather" (we don't modify it). OFL covers only the font files, so it doesn't affect the project's Apache-2.0 licence.
- **Status:** ✅ (checked by Claude Code, 2026-11-15)
- **Citation:** The Merriweather Project Authors (Eben Sorkin). *Merriweather* [typeface], with Reserved Font Name "Merriweather". SIL Open Font License 1.1. https://github.com/SorkinType/Merriweather

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
  (facts) and a link; no text or images are copied. Also cited for the selection criteria in
  `docs/landing-criteria.md`.
- **Source:** https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- **Accessed:** 2026-11-14
- **License / permission:** NASA web content; see the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
  Region names are facts, and we link the release.
- **Requirements:** Don't use NASA logos or imply NASA endorsement.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** NASA (2024, October 28). *NASA Provides Update on Artemis III Moon Landing Regions* [News release 24-136]. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/

### NASA news release 22-089, "NASA Identifies Candidate Regions for Landing Next Americans on Moon" (2022-08-19)
- **Type:** Information
- **Used for:** Backing for the 100 m site radius, the 6.5-day surface stay, the selection criteria
  (slope, lighting, communication with Earth) and the link between sites and launch timing
  (`docs/landing-criteria.md`, `docs/design.md` §4). Facts and one short quote only; no images copied.
- **Source:** https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- **Accessed:** 2026-11-14
- **License / permission:** NASA web content; see the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- **Requirements:** Credit NASA. Don't use NASA logos or imply NASA endorsement.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** NASA (2022, August 19). *NASA Identifies Candidate Regions for Landing Next Americans on Moon* [News release 22-089]. https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/

### "Artemis Human Landing System Overview", NASA presentation for the 2025 Space Apps Challenge (NTRS 20250009323)
- **Type:** Information
- **Used for:** The "Key Artemis III Landing Requirements" (slide 21: within 6° of the pole, landing slope
  under 10° at 100 m, EVA slope under 20° within 2 km, direct-to-Earth comms, surface and approach
  lighting, land within 100 m of a target) and the context on slides 19–28. Cited in
  `docs/landing-criteria.md` and `docs/design.md`. Facts and short quotes only; no slides or images copied.
- **Source:** https://ntrs.nasa.gov/citations/20250009323 (PDF: https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf)
- **Accessed:** 2026-11-14
- **License / permission:** NASA Technical Reports Server record, distribution "Public". The record notes that
  "Portions of document may include copyright protected material", so we cite facts only and copy no
  slides, images or logos.
- **Requirements:** Credit NASA and the authors. Don't reuse slide images or the NASA and Artemis logos on them.
- **Status:** ✅ for citing facts (checked by Claude Code, 2026-11-14)
- **Citation:** Ortiz, L., & Dwyer Cianciolo, A. (2025, October 4). *Artemis Human Landing System Overview: NASA 2025 International SPACE APPS Challenge* [Presentation]. NASA. NTRS 20250009323. https://ntrs.nasa.gov/citations/20250009323

### George et al. (2026), "Artemis III Site Selection Update: Down-Selection from 13 to 9 Candidate Regions" (LPSC 2026)
- **Type:** Information (conference abstract by NASA authors)
- **Used for:** Why the 9 regions were chosen: the 5.75–6.25-day surface stay, illumination for the whole
  stay, direct-to-Earth visibility, slope variability and surface hazards, robustness across mission
  epochs, and the need for more than one region. Cited in `docs/landing-criteria.md`. Paraphrase and
  short quotes only; no figures copied.
- **Source:** https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf (provided by the team)
- **Accessed:** 2026-11-14
- **License / permission:** No license is stated on the abstract. The authors are from NASA and Booz Allen
  Hamilton. Citing and paraphrasing a published abstract is normal scholarly use; we copy no text
  beyond short quotes and no figures.
- **Requirements:** Cite the authors and the conference. Don't copy the abstract text or the region image.
- **Status:** ✅ for citing (checked by Claude Code, 2026-11-14)
- **Citation:** George, T., Rubio, M. A., Lawrence, S. J., & Curell, P. (2026). Artemis III Site Selection Update: Down-Selection from 13 to 9 Candidate Regions. *57th Lunar and Planetary Science Conference*, Abstract #1901. https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf

### Gracy & Lee (2024), "Candidate Landing Sites for Artemis 3 in Two NASA Candidate Landing Regions Nearest the Lunar South Pole" (LPSC 2024)
- **Type:** Information (conference abstract; research, not a NASA requirement)
- **Used for:** Supporting evidence for the 2 km on-foot exploration range and for example site
  thresholds (slope ≤5° over 25% of a 2 km zone, Sun ≥33%, direct-to-Earth ≥50%). Cited in
  `docs/landing-criteria.md`. Paraphrase only; no figures copied.
- **Source:** https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf
- **Accessed:** 2026-11-14
- **License / permission:** No license is stated on the abstract. Citing and paraphrasing is normal
  scholarly use; we copy no text or figures.
- **Requirements:** Cite the authors and the conference.
- **Status:** ✅ for citing (checked by Claude Code, 2026-11-14)
- **Citation:** Gracy, S., & Lee, P. (2024). Candidate Landing Sites for Artemis 3 in Two NASA Candidate Landing Regions Nearest the Lunar South Pole. *55th Lunar and Planetary Science Conference*, Abstract #1695. https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf

### NASA Moon Fact Sheet (NSSDCA)
- **Type:** Information
- **Used for:** Reference values in the orbit checks (`tests/test_validation_orbit.py`):
  synodic period, obliquity to orbit, orbit inclination to the ecliptic and the
  Earth-Moon distance range. We use the numbers (facts) only; no text is copied.
- **Source:** https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html (last updated 2024-01-11)
- **Accessed:** 2026-11-14
- **License / permission:** NASA web content. The page has no copyright notice, and the
  [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
  say NASA material is generally not subject to copyright in the US and ask that NASA be credited.
- **Requirements:** Credit NASA as the source. Don't use NASA logos or imply NASA endorsement.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Williams, D. R. (2024). *Moon Fact Sheet*. NASA Space Science Data Coordinated Archive, Goddard Space Flight Center. https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html

## Candidate Resources (not yet used, licenses not yet verified)

These are the resources the challenge suggests. Before any of them is used,
check its license or terms and move it to the right section above.

| Resource | Provider | What we might use it for | URL | Status |
| -------- | -------- | ------------------------ | --- | ------ |
| JPL Horizons System | NASA/JPL (Caltech) | Sun and Earth positions (azimuth and elevation) from lunar surface sites | https://ssd.jpl.nasa.gov/horizons/ | ⚠️ Not verified. Not needed: SPICE's `azlcpo` covers the spot-check (design.md §10) |
| LROC QuickMap | Arizona State University / LRO | Exploring terrain at south-pole sites | https://quickmap.lroc.asu.edu/ | ⚠️ Not verified |
| Moon Trek | NASA/JPL (Solar System Treks) | 3D terrain context and topography | https://trek.nasa.gov/moon/ | ⚠️ Not verified |
| LOLA topography (DEMs) | NASA GSFC / LRO, via PDS | Horizon profiles that include terrain | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | ✅ Adopted: see "Data" above |
| CSA Moon Exploration | Canadian Space Agency | Background and educational content | https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ | ⚠️ Not verified (Government of Canada content, which has its own terms) |
| PGDA Lunar Polar Illumination (`AVGVISIB_75S_120M_201608`, `..._EARTH`) | NASA GSFC (PGDA) | Considered for pre-filtering Mons Mouton Plateau sites by long-term average Sun/Earth visibility | https://pgda.gsfc.nasa.gov/products/69 | ⚠️ Not used: the page states no license or terms (only "please cite Mazarico et al. 2011", doi:10.1016/j.icarus.2010.10.030), and the filter tested as lossy (design.md §3) |

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
