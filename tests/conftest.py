"""Shared fixtures: a tiny synthetic site-data folder.

Three sites at 85 S, 0 E with flat Horizons of 0, 10 and 1 deg. The Sun and
Earth hold still along +x (MOON_ME), so from 85 S the Sun stands at 5.0 deg
and Earth at 4.742 deg (parallax, see test_clearance) all year, both due north.
"""

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pytest

from pipeline.horizon import encode_horizons, quantize_horizons


def _positions(folder: Path, year: int) -> None:
    n = int((datetime(year + 1, 1, 1) - datetime(year, 1, 1)).total_seconds()) // 600
    arr = np.zeros((n, 2, 3), "<f4")
    arr[:, 0, 0] = 1.5e8
    arr[:, 1, 0] = 384_400.0
    arr.tofile(folder / f"positions-{year}.bin")
    (folder / f"positions-{year}.json").write_text(json.dumps({
        "schema_version": 1, "mock": True, "file": f"positions-{year}.bin", "dtype": "float32",
        "byte_order": "little", "shape": [n, 2, 3], "axes": ["time", "body", "xyz"], "units": "km",
        "scale": 1, "bodies": ["sun", "earth"], "frame": "MOON_ME", "aberration_correction": "LT+S",
        "start_utc": f"{year}-01-01T00:00:00Z", "step_s": 600}))


@pytest.fixture(scope="module")
def site_data(tmp_path_factory) -> Path:
    root = tmp_path_factory.mktemp("site-data")
    (root / "ephemeris").mkdir()
    for y in (2026, 2027):
        _positions(root / "ephemeris", y)
    region = root / "regions" / "demo"
    region.mkdir(parents=True)
    # Sites 3 km apart along x, all at (85 S, 0 E) as far as the sky is concerned.
    sites = [{"site_id": f"r000c00{i}", "x_m": 3000.0 * i, "y_m": 0.0, "lat_deg": -85.0, "lon_deg": 0.0,
              "terrain_height_m": -2.0} for i in range(3)]  # -2 m + 2 m Observer Height = the sphere
    (region / "sites.json").write_text(json.dumps({
        "schema_version": 1, "mock": True, "region_id": "demo", "grid_spacing_m": 200,
        "site_radius_m": 100, "observer_height_m": 2, "sites": sites}))
    hz = np.array([np.full(1440, 0.0), np.full(1440, 10.0), np.full(1440, 1.0)])
    q = quantize_horizons(hz)
    (region / "horizons.bin.gz").write_bytes(encode_horizons(q))
    (region / "horizons.json").write_text(json.dumps({
        "schema_version": 1, "mock": True, "file": "horizons.bin.gz", "dtype": "int16",
        "byte_order": "little", "shape": [3, 1440], "axes": ["site", "azimuth"], "units": "deg",
        "scale": 0.01, "azimuth_start_deg": 0, "azimuth_step_deg": 0.25, "observer_height_m": 2,
        "compression": "gzip", "delta_axis": "azimuth"}))
    return root
