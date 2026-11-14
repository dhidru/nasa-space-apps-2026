# Data contract

Status: agreed on 2026-11-14. Schema version **1**.

This document defines every file that passes between the **data side** (the
Python pipeline) and the **design side** (the front end). Terms in capitals are
defined in [GLOSSARY.md](../GLOSSARY.md). The rest of the design is in
[design.md](design.md).

- **Machine-checkable schemas** are in [`contract/schemas/`](../contract/schemas/)
  (JSON Schema 2020-12).
- **Mock data** in exactly this format is in
  [`contract/mock/`](../contract/mock/). The script `generate_mock.py` creates
  it.

Every JSON file has `schema_version` (an integer, currently `1`) and `mock` (a
boolean). Any breaking change to a format must bump `schema_version` and update
this document, the schemas and the mock generator together.

## 1. What depends on the source datasets

Nothing in this contract depends on them. Each source dataset (USGS grids, LOLA
DEMs, SPICE kernels) is converted to the conventions below when the pipeline
loads it. What a source dataset looks like is recorded only in its
**conventions card** (section 9). The data side fills that in when the dataset
is downloaded and its license is checked.

## 2. Conventions

| Quantity | Convention |
|---|---|
| Body-fixed frame | MOON_ME (DE421-compatible) |
| Latitude | Planetocentric, −90 to +90°, south negative |
| Longitude | −180 to +180°, east positive |
| Heights | Meters relative to the 1,737,400 m reference sphere |
| Map projection | South polar stereographic on the 1,737,400 m sphere, true scale at the pole: `ρ = 2R·tan(π/4 + φ/2)`, `x = ρ·sin λ`, `y = ρ·cos λ` (meters, origin at the pole) |
| Azimuth | 0 to 360°, clockwise from local north |
| Elevation / Clearance | −90 to +90°, measured from the flat local horizontal. Negative Clearance means blocked |
| Time | UTC, ISO 8601 with a `Z` suffix, to the second: `2027-03-01T00:00:00Z` |
| Time step | 600 s. Landing Times snap to the 10-minute UTC grid (:00, :10, …) |
| Supported Span | Landing Times in `[2026-11-14T00:00:00Z, 2027-11-14T00:00:00Z)`. The last Surface Stay ends `2027-11-20T23:50:00Z`, so positions cover the UTC years 2026 and 2027 |

Field names carry their unit as a suffix:
- `_deg`: degrees
- `_m`: meters
- `_km`: kilometers
- `_h`: hours
- `_s`: seconds
- `_utc`: a timestamp
- `_fraction`: a value from 0 to 1

## 3. Region naming

NASA has renamed and redrawn Landing Regions over time. The 2022 list had 13
regions and the 2024 list has 9. Some names changed, and a name that stayed may
not cover the same area. To keep that from breaking anything:

- **`id`** is our own permanent key: a lowercase hyphenated slug of the NASA
  name at the time we first add the region, for example `mons-mouton-plateau`.
  It **never changes**, even if NASA renames the region. Folders, URLs and JSON
  references use only the `id`.
- **`display_name`** is what the UI shows. If NASA renames a region, change only
  this field.
- **`nasa_name`** is the exact name in the NASA source list given in
  `regions.json` → `source`.
- **`former_names`** lists earlier NASA names. Each entry needs a primary-source
  URL. We never infer that a 2022 region "became" a 2024 region from a similar
  name. We record it only when NASA says so.
- A region from a newer NASA list whose area differs from an existing region
  gets a **new** `id`, even if the name is the same. Our ids identify areas,
  not names.

The current registry follows NASA's release of 2024-10-28 (9 regions).

## 4. Folder layout

The same layout is used for the mock data (`contract/mock/data/`) and for real
pipeline output (the final location depends on the static-vs-server decision):

```
regions.json                         Region registry (section 5.1)
home/basemap.png, basemap.json       Hillshade for the home map (section 5.5)
ephemeris/positions-<YYYY>.bin/.json Sun/Earth positions, one file per UTC year (section 6.2)
regions/<region-id>/
  outline.geojson                    Region outline (section 5.2)
  basemap.png, basemap.json          Region hillshade (section 5.5)
  sites.json                         Site grid (section 5.3)
  horizons.bin.gz, horizons.json     Horizons, delta-encoded and gzipped (section 6.1)
  results/
    ranking/<landing-time>.json          Ranking (section 7.1)
    site-detail/<landing-time>/<site-id>.json   Site detail (section 7.2)
    landing-windows/<site-id>.json       Landing Windows (section 7.3)
```

`<landing-time>` in file names uses the compact form `20270301T0000Z`, because
`:` is not allowed in Windows file names.

If we choose a server, the three `results/` documents become API responses with
the same JSON. If we choose a static site, the browser builds them from
`sites.json`, `horizons.bin.gz` and `ephemeris/`. Either way the pages read the
same documents.

## 5. Static files (JSON / GeoJSON / PNG)

### 5.1 `regions.json`: [schema](../contract/schemas/regions.schema.json)

Fields:
- `source`: which NASA list the registry follows, with its URL
- `regions[]`, each with:
  - `id`, `display_name`, `nasa_name`, `former_names[]` (each `{name, source_url}`)
  - `center` (`lat_deg`, `lon_deg`, `x_m`, `y_m`)
  - `has_site_data`: if false, the region page shows the map plus the "coming
    soon" banner
  - paths to `outline` and `basemap`

### 5.2 `outline.geojson`: [schema](../contract/schemas/outline.schema.json)

- A GeoJSON `FeatureCollection` with one `Polygon` feature.
- Coordinates are **map x/y in meters** (section 2), not lon/lat. This departs
  from RFC 7946, which assumes Earth lon/lat. It is declared in
  `properties.crs = "lunar-south-polar-stereographic-m"`.
- `properties.region_id` names the region.

### 5.3 `sites.json`: [schema](../contract/schemas/sites.schema.json)

- Region-level fields: `region_id`, `grid_spacing_m` (200), `site_radius_m`
  (100), `observer_height_m` (2).
- `sites[]`, each with:
  - `site_id`, in the form `r<row>c<col>` with 3 digits each, for example
    `r012c045`. Row 0 is the grid row with the largest y. Ids are unique within
    a region.
  - `x_m`, `y_m`, `lat_deg`, `lon_deg`
  - `terrain_height_m`
- **The order of `sites[]` is the row order of the Horizons (`horizons.bin.gz`).**

### 5.4 Site-to-site distance

Distance between sites (used for the 2 km top-10 separation) is the straight
map distance `hypot(Δx, Δy)`. At these latitudes, stereographic scale error
over 15 km is far below the 200 m grid spacing.

### 5.5 `basemap.png` + `basemap.json`: [schema](../contract/schemas/basemap.schema.json)

- The image is a grayscale hillshade PNG.
- `basemap.json` gives:
  - `image`: the file name
  - `extent_m`: `[xmin, ymin, xmax, ymax]`, the outer edges of the image
  - `pixel_size_m`
  - `width_px`, `height_px`
  - `source`: the dataset name, for attribution
- The front end places the image with OpenLayers `ImageStatic` using
  `extent_m`.

## 6. Binary arrays (`.bin` + `.json` sidecar)

Large arrays are raw, headerless, **little-endian**, row-major (C order)
binaries. A JSON sidecar describes each one: [schema](../contract/schemas/binary-sidecar.schema.json).

Common sidecar fields:
- `file`, `dtype`, `byte_order`
- `shape`: one length per axis
- `axes`: names, outermost first
- `units`
- `scale`: multiply the stored value by this to get the value in `units`

Both NumPy (`np.fromfile(...).reshape(shape)`) and browser typed arrays
(`new Int16Array(buffer)`) can read these files directly, unless the sidecar
has the optional fields below.

Optional sidecar fields for packed files (only the Horizons use them):
- `compression`: `gzip`. The file is a gzip stream; unpack it first.
- `delta_axis`: the name of the innermost axis (`azimuth`). Along that axis,
  the first value of each row is stored as is and every later value as the
  difference from the one before it. Rebuild the values with a running sum
  per row. Neighbouring values are close, so the differences are small and
  compress well.

### 6.1 Horizons: `horizons.bin.gz`

| Field | Value |
|---|---|
| `dtype` | `int16` |
| `axes` / `shape` | `["site", "azimuth"]` / `[n_sites, 1440]` |
| `units`, `scale` | `deg`, `0.01`: stored value 125 means 1.25° |
| `azimuth_start_deg`, `azimuth_step_deg` | `0`, `0.25`: column k is the Horizon Elevation at azimuth k × 0.25° |
| `observer_height_m` | `2` |
| `compression`, `delta_axis` | `gzip`, `azimuth` |

- Rows follow the order of `sites.json`.
- Between columns, use linear interpolation. It wraps, so column 1439 is next
  to column 0.
- Size: 18.4 MB unpacked for Mons Mouton's 6,400 sites, about 3.7 MB as stored
  (gzip alone would give 10.1 MB).
- **Reading it in the browser:** `fetch` the file as bytes, unpack it with the
  built-in `DecompressionStream("gzip")`, view it as an `Int16Array`, then take
  the running sum along each row of 1,440. If a host sends the file with
  `Content-Encoding: gzip`, the browser has already unpacked it: the bytes then
  don't start with the gzip header `1f 8b`, so skip the unpack step.
- **Reading it in Python:** `pipeline.horizon.decode_horizons`.

### 6.2 Sun/Earth positions: `ephemeris/positions-<YYYY>.bin`

| Field | Value |
|---|---|
| `dtype` | `float32` |
| `axes` / `shape` | `["time", "body", "xyz"]` / `[n_steps, 2, 3]` |
| `bodies` | `["sun", "earth"]` |
| `units`, `scale` | `km`, `1` |
| `frame` | `MOON_ME`. Vectors run from the Moon's center to the body |
| `aberration_correction` | `LT+S` (apparent positions) |
| `start_utc`, `step_s` | Jan 1 00:00:00 UTC of that year, `600` |

- Each file covers one UTC year, so a Surface Stay that crosses New Year reads
  two files.
- A site's local Sun or Earth direction is `body − site_position`, rotated into
  the site's local east-north-up frame.
- Size is about 1.3 MB per year.

## 7. Results documents (what the front end reads)

### Per-body stats object

The same object is used in 7.1 and 7.2, for `sun` and for `earth`:

| Field | Meaning |
|---|---|
| `min_elevation_deg`, `mean_elevation_deg`, `max_elevation_deg` | Elevation over the stay |
| `min_clearance_deg`, `mean_clearance_deg`, `max_clearance_deg` | Clearance over the stay |
| `los_fraction` | Fraction of samples in Line of Sight (0–1) |
| `los_duration_h` | Hours in Line of Sight |
| `first_los_loss_utc` | First sample with no Line of Sight, or `null` if the body never loses it |

### 7.1 Ranking: [schema](../contract/schemas/ranking.schema.json)

One document per region and Landing Time.

Header:
- `region_id`, `landing_time_utc`, `stay_end_utc`
- `step_s`, `n_samples` (1,009: the stay's start and end are both sampled)
- `top_n` (10), `top_separation_m` (2000)

`sites[]` has **one entry per site**, sorted by `rank` (1 = best):
- `site_id`, `rank`
- `coverage`: `"full"` or `"partial"`
- `worst_case_min_clearance_deg`: min of the Sun and Earth min Clearance
- `top`: true if the site is in the 2 km-separated top 10
- `sun`, `earth`: per-body stats

Ranking order (from design.md §6):
- `full` before `partial`.
- Within `full`: `worst_case_min_clearance_deg` descending, then the mean of
  the two `mean_clearance_deg` values descending.
- Within `partial`: min(`sun.los_fraction`, `earth.los_fraction`) descending.

### 7.2 Site detail: [schema](../contract/schemas/site-detail.schema.json)

One document per site and Landing Time.

- `horizon`: `azimuth_step_deg` (0.25) and `elevation_deg[1440]`. Used for the
  sky plot.
- `series`, with parallel arrays of length `n_samples`:
  - `time_utc[]`
  - for each of `sun` and `earth`: `azimuth_deg[]`, `elevation_deg[]`,
    `horizon_elevation_deg[]` (the terrain line under that body)
  - Clearance = elevation − horizon_elevation. The front end computes it rather
    than storing it.
- `stats`: `{sun, earth}`, the per-body stats objects
- `coverage`, `worst_case_min_clearance_deg`, as in the ranking

### 7.3 Landing Windows: [schema](../contract/schemas/landing-windows.schema.json)

One document per site.

- `search_start_utc`, `search_end_utc`: the range of Landing Times searched.
  This is always the Supported Span (section 2), whatever Landing Time is
  picked
- **All `end_utc` values here are exclusive:** a range is `[start, end)`. This
  applies to `search_end_utc`, runs and windows.
- `merge_gap_h` (24)
- `top_n` (10)
- `strip.runs[]`: `{start_utc, end_utc, coverage: "full" | "partial"}`
  - These are consecutive Landing Times with the same coverage, before merging.
  - They tile the search range without gaps. Anything outside it is drawn gray.
- `windows[]`, the top 10, each with:
  - `rank`, `start_utc`, `end_utc`
  - `duration_h`
  - `contains_partial_gaps`: true if merging absorbed partial runs
  - `best_landing_time_utc`
  - `best_worst_case_min_clearance_deg`

## 8. Mock data

[`contract/mock/generate_mock.py`](../contract/mock/generate_mock.py) is a
Python script that needs only the standard library. Run it from the repo root:

```bash
python contract/mock/generate_mock.py
```

To check any data folder (mock or real) against this contract:

```bash
pip install -r requirements-dev.txt
python contract/validate.py contract/mock/data
```

Output goes to `contract/mock/data/`, in the layout of section 4. What it
generates:
- **All 9 regions** in `regions.json`, with **placeholder** centers and outlines.
  These are not the real NASA locations. Only `mons-mouton` (the Demo
  Region) has `has_site_data: true`.
- **Mons Mouton sites:** a 15 × 15 km square of sites (75 × 75 = 5,625)
  at a placeholder location near 85°S.
- **Synthetic Horizons** from a handful of made-up "mountains", so the heatmap
  has realistic spatial patterns.
- **Synthetic Sun and Earth motion:**
  - The Sun circles the sky once per synodic month.
  - Earth's elevation wobbles about ±6.7° with a period of about 27.2 days, so
    some stays get Partial Coverage.
  - Both are the same for every site. Real ones differ slightly between sites.
- **One Landing Time:** `2027-03-01T00:00:00Z`.
- **Full results for that Landing Time:** a ranking, site details for the top
  10, and Landing Windows for the top 10 over the Supported Span.
- **Binaries:** horizons and one year (2027) of positions. The mock positions are
  derived from the same synthetic Sun and Earth motion, as seen from the region
  center.
- **Placeholder base-map PNGs.**

Every file has `"mock": true`. The `.bin` and `.bin.gz` files are git-ignored because of their
size, so rerun the script to get them. The JSON and PNG files are committed so
the design side can start without running anything.

## 9. Conventions cards for source datasets

Fill in a card **before** a source dataset is used. Check each value against
the file's own metadata or documentation, never against memory. Add the license
entry in [ATTRIBUTIONS.md](../ATTRIBUTIONS.md) at the same time.

```markdown
### <Dataset name and version>
- **File(s):** <names, sizes>
- **Source / license:** <URL> · see ATTRIBUTIONS.md
- **Frame:** <e.g. MOON_ME DE421>
- **Projection:** <name + parameters: center, scale, radius used>
- **Units:** <per field>
- **Ranges and signs:** <e.g. longitude 0–360°, heights relative to 1737.4 km>
- **Resolution:** <m/px or grid spacing>
- **Reference height / datum:** <sphere radius or other>
- **No-data value:** <value or none>
- **Conversion on load:** <what our loader does to reach section 2>
```

The loaders in `src/pipeline/` implement the "Conversion on load" line of each
card. Nothing else in the pipeline reads a source file directly.

### LOLA LDEM_80S_20M and LDEM_80S_80M (PDS3 GDR, product version V2.0)
- **File(s):** `ldem_80s_20m.img` (1,848,320,000 bytes, 30,400 × 30,400) and
  `ldem_80s_80m.img` (115,520,000 bytes, 7,600 × 7,600), each with a `.lbl`
  label. We may download only a band of whole rows of the 20 m file; the
  pipeline records which rows (see `pipeline.lola`).
- **Source / license:** https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ · see ATTRIBUTIONS.md
- **Frame:** `COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"`. Our
  MOON_ME (NAIF `moon_de440_250416.tf`) is aligned with it to within about
  0.5 m over 2000–2040, so no rotation is needed.
- **Projection:** `MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"`,
  `CENTER_LATITUDE = -90`, `CENTER_LONGITUDE = 0`,
  `MAP_PROJECTION_ROTATION = 0.0`, sphere `A_AXIS_RADIUS = 1737.4 km`,
  `POSITIVE_LONGITUDE_DIRECTION = "EAST"`, planetocentric latitude. The PDS4
  label (`ldem_80s_20m.xml`) gives the upper-left corner as x = −304,000 m,
  y = +304,000 m, so line 0 is the top (largest y).
  Pixel centers (0-based line `l`, sample `s`): `x = (s − SAMPLE_PROJECTION_OFFSET) · MAP_SCALE`,
  `y = (LINE_PROJECTION_OFFSET − l) · MAP_SCALE`. Both offsets are 15199.5 for 20 m and
  3799.5 for 80 m. This is the same projection as section 2, so x/y carry over unchanged.
- **Units:** int16 DN, `SAMPLE_TYPE = LSB_INTEGER`, `SAMPLE_BITS = 16`.
  `HEIGHT = DN · SCALING_FACTOR` with `SCALING_FACTOR = 0.5`, `UNIT = METER`.
- **Ranges and signs:** `DERIVED_MINIMUM = -14594`, `DERIVED_MAXIMUM = 14054`
  (20 m), i.e. −7,297 to +7,027 m. Longitude is east-positive.
- **Resolution:** `MAP_SCALE` = 20 m/px and 80 m/px. The 80°S–90°S coverage is a
  608 km square centered on the pole.
- **Reference height / datum:** heights are relative to the 1,737,400 m sphere
  (`OFFSET = 1737400.`, `PLANETARY_RADIUS = DN · SCALING_FACTOR + OFFSET`).
  This is the same datum as section 2.
- **No-data value:** none. The labels have no `MISSING_CONSTANT`; the grids are
  interpolated everywhere (GMT `surface`). The labels call the source data
  "preliminary".
- **Conversion on load:** multiply DN by 0.5 to get meters. Map pixels to x/y
  with the formula above. No change of frame, datum or longitude sign.

### USGS Artemis III region outlines (`A3_9regions-lonlat-simplified.zip`)
- **File(s):** `A3_9regions-lonlat-simplified.zip` (637,136 bytes) from
  release DOI 10.5066/P1MEQ6UK, downloaded 2026-11-14 through the ScienceBase
  CAPTCHA. It contains a polygon shapefile (`.shp/.shx/.dbf/.prj/.cpg`), a
  `.geojson` copy, a preview `.jpg` and a QGIS `.qmd`. We read only the
  shapefile. Fields: `OBJECTID`, `Region`, `Area_km2`, `RegionCode`,
  `Shape_Leng`, `Shape_Area`. There are 9 records.
- **Source / license:** https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 · CC0 · see ATTRIBUTIONS.md
- **Frame:** the release requires the DE421 mean-Earth frame ("The datum
  utilized must be the Jet Propulsion Laboratory (JPL) Development Ephemeris
  (DE) 421 in the Mean Earth (ME) …"). That is our MOON_ME.
- **Projection:** none; geographic longitude/latitude. The `.prj` reads
  `GEOGCS["GCS_Moon_2000",DATUM["D_Moon_2000",SPHEROID["Moon_2000_IAU_IAG",1737400.0,0.0]],PRIMEM["Reference_Meridian",0.0],UNIT["Degree",0.0174532925199433]]`.
  The QGIS `.qmd` sidecar names WGS 84 (Earth); that is stale editor
  metadata, and we follow the `.prj`.
- **Units:** degrees.
- **Ranges and signs:** longitudes already in −180…180°, east-positive
  (file bbox −77.47° to 135.00° E, −88.66° to −82.85° latitude).
- **Resolution:** each region is one 4-corner polygon (5 vertices, closed).
  Projected with section 2, each region's area matches the file's
  `Area_km2` to 0.1 km², and the 20 km regions come out with 20.0 km sides.
  So the corners were laid out in the same polar stereographic projection,
  and straight edges on our map are the intended edges.
- **Reference height / datum:** 1,737,400 m sphere (no heights in this file).
- **No-data value:** not applicable.
- **Conversion on load:** check the `.prj`, wrap longitudes to −180–180°
  (a no-op for this file), map the `Region` names to our region ids, and
  project vertices to section-2 x/y.
- **Note:** Mons Mouton Plateau is 76.9 × 57.9 km (4,451.8 km²). That is why
  the Demo Region became Mons Mouton (16 × 16 km); see design.md §3. The other
  regions are 20–30 km squares.

### NAIF SPICE kernels (DE440)
- **File(s):** `de440s.bsp` (planetary SPK, 31 MB), `moon_pa_de440_200625.bpc`
  (lunar orientation PCK, 12 MB), `moon_de440_250416.tf` (lunar frame kernel,
  19 KB), `naif0012.tls` (leap seconds, 5 KB).
- **Source / license:** https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ · see ATTRIBUTIONS.md
- **Frame:** we ask SPICE for vectors in `MOON_ME`. In `moon_de440_250416.tf`,
  "MOON_ME is an alias for the frame MOON_ME_DE440_ME421" (frame ID 31001 →
  31009), which is "closely aligned with the lunar mean Earth/polar axis frame
  associated with the planetary ephemeris DE421". The kernel gives the maximum
  difference from DE421 ME as about 53.4 cm over 2000–2040.
- **Projection:** not applicable (3D Cartesian vectors).
- **Units:** km for positions. SPICE time is TDB seconds past J2000; we convert
  from UTC with the leap-second kernel.
- **Ranges and signs:** `de440s.bsp` covers 1849-12-26 to 2150-01-22 (from
  NAIF's `aa_summaries.txt`); `moon_pa_de440_200625.bpc` covers 1549-12-31 to
  2650-01-25. Both cover our Supported Span (2026–2027).
- **Resolution:** continuous; we sample every 600 s.
- **Reference height / datum:** vectors run from the Moon's center of mass
  (observer `MOON`) to the body, with `LT+S` aberration correction.
- **No-data value:** not applicable.
- **Conversion on load:** none. Only `pipeline.ephemeris` loads kernels, and
  it writes vectors already in the section 6.2 format.
