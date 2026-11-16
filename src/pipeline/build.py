"""Build the static data files of docs/data-contract.md §4 from the source datasets.

Writes regions.json, the home and region base maps, every region outline, and
for each region with site data: sites.json and horizons.bin.gz/.json. Sun/Earth
positions are written by pipeline.ephemeris, and the results/ documents (ranking,
site detail, Landing Windows) by pipeline.results.

    python -m pipeline.build [OUT_DIR]      # default: data/processed/site-data
"""

from __future__ import annotations

import json
import struct
import sys
import time
import zlib
from pathlib import Path
from typing import Callable

import numpy as np

from .horizon import compute_site_horizons, encode_horizons, quantize_horizons
from .lola import DemGrid, lines_covering, open_lola
from .projection import xy_to_lonlat
from .regions import NASA_SOURCE, REGIONS, Outline, load_outlines
from .sites import build_site_grid

SCHEMA_VERSION = 1
# Every region except Mons Mouton Plateau, which is too large for a static site (design.md §3).
SITE_REGIONS = frozenset({"peak-near-cabeus-b", "haworth", "malapert-massif", "mons-mouton", "nobile-rim-1",
                          "nobile-rim-2", "de-gerlache-rim-2", "slater-plain"})
SITE_SPACING_M = 200.0
SITE_RADIUS_M = 100.0
OBSERVER_HEIGHT_M = 2.0
N_AZIMUTHS = 1440
BASEMAP_MARGIN_M = 2_000.0
LOLA_80M = "LOLA LDEM_80S_80M (PDS LRO-L-LOLA-4-GDR-V1.0), hillshade"
LOLA_20M = "LOLA LDEM_80S_20M (PDS LRO-L-LOLA-4-GDR-V1.0), hillshade"

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / "data" / "raw"


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def _r(v: float, nd: int = 3) -> float:
    return round(float(v), nd)


# ------------------------------------------------------------------ base maps

HILLSHADE_LIGHT_AZIMUTH_DEG = 315.0  # map direction, clockwise from map up (+y): the upper left
HILLSHADE_LIGHT_ALTITUDE_DEG = 35.0


def hillshade(heights: np.ndarray, pixel_m: float) -> np.ndarray:
    """uint8 hillshade; row 0 is the top (largest y); lit from the map's upper left."""
    dzdx = np.gradient(heights, pixel_m, axis=1)
    dzdy = -np.gradient(heights, pixel_m, axis=0)  # rows run toward -y
    # Brightness = unit surface normal (-dz/dx, -dz/dy, 1) . unit light vector.
    az, alt = np.radians(HILLSHADE_LIGHT_AZIMUTH_DEG), np.radians(HILLSHADE_LIGHT_ALTITUDE_DEG)
    light = (np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt))
    v = (-dzdx * light[0] - dzdy * light[1] + light[2]) / np.sqrt(dzdx**2 + dzdy**2 + 1.0)
    return np.clip(40 + 200 * v, 0, 255).astype(np.uint8)


def write_png_gray(path: Path, pixels: np.ndarray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    h, w = pixels.shape
    raw = np.hstack([np.zeros((h, 1), np.uint8), pixels]).tobytes()  # filter byte 0 per row
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def write_basemap(folder: Path, extent_m: list[float], pixel_m: float, dems: list[tuple[DemGrid, str]]) -> None:
    """Hillshade of the first DEM in `dems` that covers the whole extent."""
    xmin, ymin, xmax, ymax = extent_m
    w, h = round((xmax - xmin) / pixel_m), round((ymax - ymin) / pixel_m)
    xs = xmin + (np.arange(w) + 0.5) * pixel_m
    ys = ymax - (np.arange(h) + 0.5) * pixel_m
    X, Y = np.meshgrid(xs, ys)
    for dem, source in dems:
        heights = dem.height_at(X, Y)
        if not np.isnan(heights).any():
            break
    else:
        raise ValueError(f"no DEM covers base map extent {extent_m}")
    write_png_gray(folder / "basemap.png", hillshade(heights, pixel_m))
    _write_json(folder / "basemap.json", {
        "schema_version": SCHEMA_VERSION, "mock": False, "image": "basemap.png",
        "extent_m": [_r(v, 1) for v in extent_m], "pixel_size_m": pixel_m,
        "width_px": int(w), "height_px": int(h), "source": source,
    })


def region_extent(outline: Outline, pixel_m: float) -> list[float]:
    lo = np.floor((outline.xy_m.min(axis=0) - BASEMAP_MARGIN_M) / pixel_m) * pixel_m
    hi = np.ceil((outline.xy_m.max(axis=0) + BASEMAP_MARGIN_M) / pixel_m) * pixel_m
    return [float(lo[0]), float(lo[1]), float(hi[0]), float(hi[1])]


# ------------------------------------------------------------------ regions

def _centroid_xy(ring: np.ndarray) -> tuple[float, float]:
    x, y = ring[:-1, 0], ring[:-1, 1]
    x1, y1 = np.roll(x, -1), np.roll(y, -1)
    cross = x * y1 - x1 * y
    a = cross.sum() / 2.0
    return float(((x + x1) * cross).sum() / (6 * a)), float(((y + y1) * cross).sum() / (6 * a))


def write_outline(folder: Path, outline: Outline) -> None:
    _write_json(folder / "outline.geojson", {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[[_r(x, 1), _r(y, 1)] for x, y in outline.xy_m]]},
            "properties": {"schema_version": SCHEMA_VERSION, "mock": False, "region_id": outline.region_id,
                           "crs": "lunar-south-polar-stereographic-m"},
        }],
    })


def write_region_sites(folder: Path, outline: Outline, near: DemGrid, far: DemGrid, horizon_kw: dict) -> int:
    sites = build_site_grid(outline.xy_m, near, spacing_m=SITE_SPACING_M)
    _write_json(folder / "sites.json", {
        "schema_version": SCHEMA_VERSION, "mock": False, "region_id": outline.region_id,
        "grid_spacing_m": SITE_SPACING_M, "site_radius_m": SITE_RADIUS_M, "observer_height_m": OBSERVER_HEIGHT_M,
        "sites": [{"site_id": s.site_id, "x_m": _r(s.x_m, 1), "y_m": _r(s.y_m, 1), "lat_deg": _r(s.lat_deg, 6),
                   "lon_deg": _r(s.lon_deg, 6), "terrain_height_m": _r(s.terrain_height_m, 1)} for s in sites],
    })
    kw = {"n_azimuths": N_AZIMUTHS, **horizon_kw}
    hz = compute_site_horizons([s.x_m for s in sites], [s.y_m for s in sites], [s.terrain_height_m for s in sites],
                               near, far, radius_m=SITE_RADIUS_M, observer_height_m=OBSERVER_HEIGHT_M, **kw)
    q = quantize_horizons(hz)
    (folder / "horizons.bin.gz").write_bytes(encode_horizons(q))
    _write_json(folder / "horizons.json", {
        "schema_version": SCHEMA_VERSION, "mock": False, "file": "horizons.bin.gz", "dtype": "int16",
        "byte_order": "little", "shape": list(q.shape), "axes": ["site", "azimuth"], "units": "deg",
        "scale": 0.01, "azimuth_start_deg": 0, "azimuth_step_deg": 360.0 / kw["n_azimuths"],
        "observer_height_m": OBSERVER_HEIGHT_M, "region_id": outline.region_id,
        "compression": "gzip", "delta_axis": "azimuth",
    })
    return len(sites)


def build_dataset(out: Path, outlines: dict[str, Outline], *, far: DemGrid,
                  near: DemGrid | Callable[[Outline], DemGrid], site_regions: set[str],
                  horizon_kw: dict | None = None, home_pixel_m: float = 400.0) -> None:
    """`near` is one 20 m DEM for every region, or a function that returns the one for a region's outline."""
    out = Path(out)
    horizon_kw = horizon_kw or {}
    # Home map: the whole far DEM.
    n_rows, n_cols = far.heights_m.shape
    half = far.pixel_m / 2
    home = [far.x0_m - half, far.y0_m - (n_rows - 1) * far.pixel_m - half,
            far.x0_m + (n_cols - 1) * far.pixel_m + half, far.y0_m + half]
    home = [np.ceil(home[0] / home_pixel_m) * home_pixel_m, np.ceil(home[1] / home_pixel_m) * home_pixel_m,
            np.floor(home[2] / home_pixel_m) * home_pixel_m, np.floor(home[3] / home_pixel_m) * home_pixel_m]
    write_basemap(out / "home", [float(v) for v in home], home_pixel_m, [(far, LOLA_80M)])

    entries = []
    for region in REGIONS:
        rid = region.region_id
        outline = outlines[rid]
        folder = out / "regions" / rid
        write_outline(folder, outline)
        has_sites = rid in site_regions
        if has_sites:
            near_dem = near(outline) if callable(near) else near
            write_basemap(folder, region_extent(outline, near_dem.pixel_m), near_dem.pixel_m, [(near_dem, LOLA_20M)])
            t0 = time.time()
            n = write_region_sites(folder, outline, near_dem, far, horizon_kw)
            del near_dem
            print(f"{rid}: {n} sites, Horizons in {time.time() - t0:.0f} s")
        else:
            write_basemap(folder, region_extent(outline, far.pixel_m), far.pixel_m, [(far, LOLA_80M)])
        cx, cy = _centroid_xy(outline.xy_m)
        lon, lat = xy_to_lonlat(cx, cy)
        entries.append({
            "id": rid, "display_name": region.nasa_name, "nasa_name": region.nasa_name, "former_names": [],
            "center": {"lat_deg": _r(lat, 6), "lon_deg": _r(lon, 6), "x_m": _r(cx, 1), "y_m": _r(cy, 1)},
            "has_site_data": has_sites,
            "outline": f"regions/{rid}/outline.geojson", "basemap": f"regions/{rid}/basemap.json",
        })
    _write_json(out / "regions.json", {"schema_version": SCHEMA_VERSION, "mock": False,
                                       "source": NASA_SOURCE, "regions": entries})


def near_band_loader(lola_dir: Path) -> Callable[[Outline], DemGrid]:
    """Opens the downloaded LDEM_80S_20M band (pipeline.fetch lola20 REGION) that covers a region."""
    from .fetch import BAND_MARGIN_M

    lbl = lola_dir / "ldem_80s_20m.lbl"
    bands = []
    for img in lola_dir.glob("ldem_80s_20m_lines*.img"):
        info = json.loads(img.with_suffix(".band.json").read_text())
        bands.append((int(info["first_line"]), int(info["first_line"]) + int(info["n_lines"]), img))

    def load(outline: Outline) -> DemGrid:
        y = outline.xy_m[:, 1]
        first, end = lines_covering(lbl, y.min() - BAND_MARGIN_M, y.max() + BAND_MARGIN_M)
        for a, b, img in sorted(bands, key=lambda t: t[1] - t[0]):  # smallest band first: less memory
            if a <= first and end <= b:
                return open_lola(lbl, img)
        raise FileNotFoundError(f"{outline.region_id}: no 20 m band covers lines {first}-{end}; "
                                f"run python -m pipeline.fetch lola20 {outline.region_id}")

    return load


def main(out: Path) -> None:
    shp = next((RAW / "usgs" / "A3_9regions-lonlat-simplified").rglob("*.shp"))
    outlines = load_outlines(shp)
    far = open_lola(RAW / "lola" / "ldem_80s_80m.lbl", RAW / "lola" / "ldem_80s_80m.img")
    build_dataset(out, outlines, far=far, near=near_band_loader(RAW / "lola"), site_regions=set(SITE_REGIONS))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "data" / "processed" / "site-data")
