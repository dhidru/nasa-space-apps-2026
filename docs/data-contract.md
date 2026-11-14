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
  horizons.bin, horizons.json        Horizons (section 6.1)
  results/
    ranking/<landing-time>.json          Ranking (section 7.1)
    site-detail/<landing-time>/<site-id>.json   Site detail (section 7.2)
    landing-windows/<site-id>.json       Landing Windows (section 7.3)
```

`<landing-time>` in file names uses the compact form `20270301T0000Z`, because
`:` is not allowed in Windows file names.

If we choose a server, the three `results/` documents become API responses with
the same JSON. If we choose a static site, the browser builds them from
`sites.json`, `horizons.bin` and `ephemeris/`. Either way the pages read the
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
- **The order of `sites[]` is the row order of `horizons.bin`.**

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
(`new Int16Array(buffer)`) can read these files directly.

### 6.1 Horizons: `horizons.bin`

| Field | Value |
|---|---|
| `dtype` | `int16` |
| `axes` / `shape` | `["site", "azimuth"]` / `[n_sites, 1440]` |
| `units`, `scale` | `deg`, `0.01`: stored value 125 means 1.25° |
| `azimuth_start_deg`, `azimuth_step_deg` | `0`, `0.25`: column k is the Horizon Elevation at azimuth k × 0.25° |
| `observer_height_m` | `2` |

- Rows follow the order of `sites.json`.
- Between columns, use linear interpolation. It wraps, so column 1439 is next
  to column 0.
- Size is about 16 MB for 5,625 sites.

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

- `search_start_utc`, `search_end_utc`: the range of Landing Times searched, 12
  months
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
  These are not the real NASA locations. Only `mons-mouton-plateau` has
  `has_site_data: true`.
- **Mons Mouton Plateau sites:** a 15 × 15 km square of sites (75 × 75 = 5,625)
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
  10, and Landing Windows for the top 10 over 2027-03-01 to 2028-03-01.
- **Binaries:** horizons and one year (2027) of positions. The mock positions are
  derived from the same synthetic Sun and Earth motion, as seen from the region
  center.
- **Placeholder base-map PNGs.**

Every file has `"mock": true`. The `.bin` files are git-ignored because of their
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

_No cards yet. The data side adds them as datasets are adopted._
