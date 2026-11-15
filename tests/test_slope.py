"""Landing Slope (the worst 100 m-scale slope in a Landing Site's 100 m circle) and EVA Walkable Share
(the share of the 2 km circle under 20 deg)."""

import json
import math
import shutil
from pathlib import Path

import numpy as np
import pytest
from jsonschema import Draft202012Validator

from pipeline.lola import DemGrid
from pipeline.slope import eva_walkable_fraction, landing_slope_deg, write_slopes

SCHEMAS = Path(__file__).resolve().parents[1] / "contract" / "schemas"

PIXEL_M = 20.0


def dem_around(cx_m: float, cy_m: float, heights_of, half_km: float = 1.0) -> DemGrid:
    """A 20 m DEM reaching half_km from (cx, cy) in x and y; heights_of(X, Y) gives the heights in meters."""
    n = 2 * round(half_km * 1000 / PIXEL_M) + 1
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


def test_eva_walkable_share_is_the_share_of_the_2_km_circle_under_20_deg():
    # Two half-planes meeting along x = 0: 15 deg (walkable) on the left, 25 deg (too steep) on the right.
    # A site at x = 0 has about half its circle on each side; one at x = -1000 has the line 1000 m away,
    # so the steep part is the segment beyond it: (acos(1/2) - sin(acos(1/2)) / 2) / pi = 0.1955.
    def heights(X, Y):
        return np.where(X < 0, math.tan(math.radians(15)), math.tan(math.radians(25))) * X
    dem = dem_around(0.0, 0.0, heights, half_km=3.5)
    centre, west = eva_walkable_fraction(dem, [0.0, -1000.0], [0.0, 0.0])
    assert centre == pytest.approx(0.5, abs=0.02)
    seg = math.acos(0.5) - math.sin(2 * math.acos(0.5)) / 2
    assert west == pytest.approx(1 - seg / math.pi, abs=0.02)


def test_eva_walkable_share_ignores_ground_beyond_2_km():
    # Everything steeper than 20 deg except a flat disc 2.2 km across.
    def heights(X, Y):
        return np.where(np.hypot(X, Y) < 2200.0, 0.0, math.tan(math.radians(30)) * X)
    dem = dem_around(0.0, 0.0, heights, half_km=3.5)
    assert eva_walkable_fraction(dem, [0.0], [0.0])[0] == 1.0


def test_each_site_in_sites_json_gets_its_slopes_and_nothing_else_changes(site_data: Path, tmp_path: Path):
    site_data = Path(shutil.copytree(site_data, tmp_path / "site-data"))  # the fixture is shared by the module
    path = site_data / "regions" / "demo" / "sites.json"
    before = json.loads(path.read_text(encoding="utf-8"))
    # The demo sites sit at x = 0, 3000, 6000 m on y = 0. The ground is flat up to x = 1500, then climbs
    # at 3 deg, at 12 deg from x = 4500 and at 30 deg (too steep for EVA) from x = 7500. That line is
    # 1500 m from the last site, so the steep part of its 2 km circle is a segment of
    # (acos(3/4) - sin(acos(3/4)) * 3/4) / pi = 0.0721.
    def heights(X, Y):
        tan = lambda d: math.tan(math.radians(d))
        return (tan(3) * np.clip(X - 1500, 0, 3000) + tan(12) * np.clip(X - 4500, 0, 3000)
                + tan(30) * np.maximum(X - 7500, 0))
    xs, ys = -2400.0 + np.arange(541) * PIXEL_M, 2400.0 - np.arange(241) * PIXEL_M
    X, Y = np.meshgrid(xs, ys)
    dem = DemGrid(heights_m=heights(X, Y).astype(np.float32), x0_m=xs[0], y0_m=ys[0], pixel_m=PIXEL_M)

    write_slopes(site_data, "demo", dem)

    after = json.loads(path.read_text(encoding="utf-8"))
    assert [s["landing_slope_deg"] for s in after["sites"]] == [0.0, 3.0, 12.0]
    theta = math.acos(0.75)
    walkable = [s["eva_walkable_fraction"] for s in after["sites"]]
    assert walkable[:2] == [1.0, 1.0]
    assert walkable[2] == pytest.approx(1 - (theta - math.sin(theta) * 0.75) / math.pi, abs=0.01)
    for s in after["sites"]:
        del s["landing_slope_deg"], s["eva_walkable_fraction"]
    assert after == before
    schema = json.loads((SCHEMAS / "sites.schema.json").read_text())
    assert [e.message for e in Draft202012Validator(schema).iter_errors(json.loads(path.read_text()))] == []


def test_a_site_with_any_steep_ground_is_stored_under_1(site_data: Path, tmp_path: Path):
    site_data = Path(shutil.copytree(site_data, tmp_path / "site-data"))
    # A 40 deg ramp from x = 1990 m. In the 2 km circle of the site at (0, 0) only the 100 m patch around
    # the pixel at (2000, 0) tilts past 20 deg (28.6 deg; the patch around x = 1980 tilts 16.4 deg), so 1 of
    # about 31,400 pixels is too steep: 0.99997, which rounding would store as 1.
    xs, ys = -2400.0 + np.arange(541) * PIXEL_M, 2400.0 - np.arange(241) * PIXEL_M
    X, Y = np.meshgrid(xs, ys)
    h = math.tan(math.radians(40)) * np.maximum(X - 1990.0, 0.0)
    dem = DemGrid(heights_m=h.astype(np.float32), x0_m=xs[0], y0_m=ys[0], pixel_m=PIXEL_M)

    _, walkable = write_slopes(site_data, "demo", dem)

    assert 0.9999 < walkable[0] < 1.0
    site0 = json.loads((site_data / "regions" / "demo" / "sites.json").read_text(encoding="utf-8"))["sites"][0]
    assert site0["eva_walkable_fraction"] == 0.9999
