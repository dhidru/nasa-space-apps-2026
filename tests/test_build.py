import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.build import build_dataset
from pipeline.horizon import decode_horizons
from pipeline.lola import DemGrid
from pipeline.projection import lonlat_to_xy
from pipeline.regions import REGIONS, Outline

ROOT = Path(__file__).resolve().parents[1]


def _validator():
    spec = importlib.util.spec_from_file_location("validate", ROOT / "contract" / "validate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def square_outline(region_id, lon, lat, half_deg=0.02):
    ring = np.array([[lon - half_deg * 5, lat - half_deg], [lon + half_deg * 5, lat - half_deg],
                     [lon + half_deg * 5, lat + half_deg], [lon - half_deg * 5, lat + half_deg],
                     [lon - half_deg * 5, lat - half_deg]])
    x, y = lonlat_to_xy(ring[:, 0], ring[:, 1])
    return Outline(region_id, region_id, ring, np.column_stack([x, y]))


def bumpy_dem(pixel, half_width=200_000.0):
    n = int(2 * half_width / pixel) + 1
    xs = -half_width + pixel * np.arange(n)
    X, Y = np.meshgrid(xs, xs[::-1])
    h = 500.0 * np.sin(X / 7_000.0) * np.cos(Y / 9_000.0)
    return DemGrid(heights_m=h.astype(np.float32), x0_m=float(xs[0]), y0_m=float(xs[-1]), pixel_m=pixel)


@pytest.mark.parametrize("near_per_region", [False, True])
def test_built_dataset_passes_the_contract_validator(tmp_path, near_per_region):
    outlines = {r.region_id: square_outline(r.region_id, -160.0 + 40.0 * i, -86.0) for i, r in enumerate(REGIONS)}
    far = bumpy_dem(400.0)
    near = bumpy_dem(100.0, half_width=200_000.0)
    asked = []
    near_arg = (lambda outline: asked.append(outline.region_id) or near) if near_per_region else near
    build_dataset(tmp_path, outlines, far=far, near=near_arg, site_regions={"mons-mouton"},
                  horizon_kw={"n_azimuths": 1440, "near_max_m": 1_000.0, "far_max_m": 5_000.0},
                  home_pixel_m=2_000.0)

    assert _validator().main(tmp_path) == 0

    regions = json.loads((tmp_path / "regions.json").read_text())
    assert regions["mock"] is False
    flags = {r["id"]: r["has_site_data"] for r in regions["regions"]}
    assert flags["mons-mouton"] is True and sum(flags.values()) == 1
    assert asked == (["mons-mouton"] if near_per_region else [])

    folder = tmp_path / "regions" / "mons-mouton"
    sites = json.loads((folder / "sites.json").read_text())
    hz_meta = json.loads((folder / "horizons.json").read_text())
    assert hz_meta["file"] == "horizons.bin.gz" and hz_meta["compression"] == "gzip"
    hz = decode_horizons((folder / hz_meta["file"]).read_bytes(), hz_meta["shape"])
    assert len(sites["sites"]) >= 6  # the synthetic outline is about 1.2 km x 0.4 km
    assert hz.shape == (len(sites["sites"]), 1440)
    assert sites["observer_height_m"] == 2 and hz_meta["observer_height_m"] == 2
    assert (hz > -9000).all() and (hz < 9000).all()
    assert (tmp_path / "home" / "basemap.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def test_hillshade_lights_slopes_facing_the_upper_left():
    from pipeline.build import hillshade

    n, pixel = 50, 20.0
    xs = pixel * np.arange(n)
    X, Y = np.meshgrid(xs, xs[::-1])  # row 0 is the largest y
    # z = x - y rises to the east and south, so the slope faces north-west (map upper left).
    facing_nw = hillshade(0.3 * (X - Y), pixel)
    facing_se = hillshade(0.3 * (Y - X), pixel)
    flat = hillshade(np.zeros_like(X), pixel)
    assert facing_nw[25, 25] > flat[25, 25] > facing_se[25, 25]
