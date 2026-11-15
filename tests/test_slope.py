"""Landing Slope: the worst 100 m-scale slope anywhere in a Landing Site's 100 m circle."""

import json
import math
import shutil
from pathlib import Path

import numpy as np
import pytest
from jsonschema import Draft202012Validator

from pipeline.lola import DemGrid
from pipeline.slope import landing_slope_deg, write_landing_slope

SCHEMAS = Path(__file__).resolve().parents[1] / "contract" / "schemas"

PIXEL_M = 20.0


def dem_around(cx_m: float, cy_m: float, heights_of) -> DemGrid:
    """A 2 km x 2 km, 20 m DEM centered on (cx, cy); heights_of(X, Y) gives the heights in meters."""
    n = 101
    xs = cx_m + (np.arange(n) - n // 2) * PIXEL_M
    ys = cy_m - (np.arange(n) - n // 2) * PIXEL_M
    X, Y = np.meshgrid(xs, ys)
    return DemGrid(heights_m=heights_of(X, Y).astype(np.float32), x0_m=float(xs[0]), y0_m=float(ys[0]), pixel_m=PIXEL_M)


def test_a_tilted_plane_near_the_pole_has_its_own_slope_everywhere():
    dem = dem_around(0.0, 0.0, lambda X, Y: math.tan(math.radians(5.0)) * (0.6 * X + 0.8 * Y))
    np.testing.assert_allclose(landing_slope_deg(dem, [0.0, 300.0, -500.0], [0.0, -200.0, 400.0]), 5.0, atol=1e-3)


def test_one_spike_counts_only_if_a_100_m_patch_inside_the_circle_reaches_it():
    # A 10 m spike at (60, 0). A 100 m patch (5 x 5 pixels, 80 m between the outer pixel centers) centered
    # within 100 m of a site reaches 140 m from it. The least-squares plane of a patch with the spike in a
    # corner has a gradient of hypot(40, 40) * 10 / (5 * (40^2 + 20^2 + 0 + 20^2 + 40^2)) = 0.02828.
    dem = dem_around(0.0, 0.0, lambda X, Y: np.where((X == 60.0) & (Y == 0.0), 10.0, 0.0))
    near, far = landing_slope_deg(dem, [0.0, 260.0], [0.0, 0.0])
    assert near == pytest.approx(math.degrees(math.atan(math.hypot(40, 40) * 10 / 20_000)), abs=1e-4)
    assert far == 0.0  # 200 m away: out of reach


def test_slopes_are_measured_on_the_ground_not_on_the_map():
    # 160 km from the pole the stereographic map stretches the ground by k = 1 + (rho / 2R)^2 = 1.00212,
    # so one map meter is 1 / k ground meters and the true gradient is k times the map gradient.
    rho = 160_000.0
    k = 1 + (rho / (2 * 1_737_400.0)) ** 2
    dem = dem_around(0.0, -rho, lambda X, Y: 0.1 * X)
    assert landing_slope_deg(dem, [0.0], [-rho])[0] == pytest.approx(math.degrees(math.atan(0.1 * k)), abs=1e-4)


def test_each_site_in_sites_json_gets_its_landing_slope_and_nothing_else_changes(site_data: Path, tmp_path: Path):
    site_data = Path(shutil.copytree(site_data, tmp_path / "site-data"))  # the fixture is shared by the module
    path = site_data / "regions" / "demo" / "sites.json"
    before = json.loads(path.read_text(encoding="utf-8"))
    # The demo sites sit at x = 0, 3000, 6000 m on y = 0: flat, then tilted 3 deg, then 12 deg.
    def heights(X, Y):
        return np.where(X < 1500, 0.0, np.where(X < 4500, math.tan(math.radians(3)), math.tan(math.radians(12)))) * X
    n = 451
    xs, ys = -1000.0 + np.arange(n) * PIXEL_M, 1000.0 - np.arange(101) * PIXEL_M
    X, Y = np.meshgrid(xs, ys)
    dem = DemGrid(heights_m=heights(X, Y).astype(np.float32), x0_m=xs[0], y0_m=ys[0], pixel_m=PIXEL_M)

    write_landing_slope(site_data, "demo", dem)

    after = json.loads(path.read_text(encoding="utf-8"))
    assert [s["landing_slope_deg"] for s in after["sites"]] == [0.0, 3.0, 12.0]
    for s in after["sites"]:
        del s["landing_slope_deg"]
    assert after == before
    schema = json.loads((SCHEMAS / "sites.schema.json").read_text())
    assert [e.message for e in Draft202012Validator(schema).iter_errors(json.loads(path.read_text()))] == []
