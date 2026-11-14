import math

import numpy as np
import pytest

from pipeline.horizon import compute_horizons, quantize_horizons
from pipeline.lola import DemGrid
from pipeline.projection import R_M, lonlat_to_xy

# One site at lat -85, lon 0. Local north points away from the south pole (toward the
# equator), which on the map is +y there; east is +x.
SITE_X, SITE_Y = lonlat_to_xy(0.0, -85.0)
SITE_H = 0.0
DIP_2M_DEG = -math.degrees(math.acos(R_M / (R_M + 2.0)))  # flat sphere, 2 m observer: about -0.0869 deg


def grid(fn, half_width_m=40_000.0, pixel=50.0):
    """A DEM centred on the site, heights = fn(x, y)."""
    n = int(2 * half_width_m / pixel) + 1
    xs = SITE_X - half_width_m + pixel * np.arange(n)
    ys = SITE_Y + half_width_m - pixel * np.arange(n)
    X, Y = np.meshgrid(xs, ys)
    return DemGrid(heights_m=fn(X, Y).astype(np.float32), x0_m=float(xs[0]), y0_m=float(ys[0]), pixel_m=pixel)


def flat():
    return grid(lambda X, Y: np.zeros_like(X))


def wall_north(distance_m, height_m):
    return grid(lambda X, Y: np.where(Y > SITE_Y + distance_m, height_m, 0.0))


def elevation_deg(d_ground_m, target_h, observer_h=2.0):
    th = d_ground_m / R_M
    return math.degrees(math.atan2((R_M + target_h) * math.cos(th) - (R_M + observer_h), (R_M + target_h) * math.sin(th)))


def run(near, far, n_az=8, **kw):
    kw.setdefault("near_max_m", 5_000.0)
    kw.setdefault("far_max_m", 35_000.0)
    return compute_horizons(np.array([SITE_X]), np.array([SITE_Y]), np.array([SITE_H]), near, far, n_azimuths=n_az, **kw)[0]


def test_flat_sphere_horizon_is_the_geometric_dip_everywhere():
    h = run(flat(), flat())
    np.testing.assert_allclose(h, DIP_2M_DEG, atol=0.002)


def test_wall_to_the_north_raises_the_horizon_at_azimuth_0_only():
    # Stereographic scale at 85 S is 2 / (1 + sin 85) = 1.0019, so 10 km on the map is 9.981 km on the ground.
    k = 2.0 / (1.0 + math.sin(math.radians(85.0)))
    h = run(wall_north(10_000.0, 1_000.0), wall_north(10_000.0, 1_000.0))  # azimuths 0, 45, 90, ... 315
    assert h[0] == pytest.approx(elevation_deg(10_000.0 / k, 1_000.0), abs=0.05)  # about 5.7 deg
    assert h[1] == pytest.approx(elevation_deg(10_000.0 * math.sqrt(2) / k, 1_000.0), abs=0.1)  # NE, about 4 deg
    assert h[7] == pytest.approx(h[1], abs=0.05)  # NW mirrors NE
    for i in (2, 3, 4, 5, 6):  # E, SE, S, SW, W see flat ground
        assert h[i] == pytest.approx(DIP_2M_DEG, abs=0.002)


def test_azimuths_are_clockwise_from_north():
    # A wall to the east only (x > site + 3 km): it must appear at azimuth 90, not 270.
    east = grid(lambda X, Y: np.where(X > SITE_X + 3_000.0, 500.0, 0.0))
    h = run(east, east, n_az=4)  # 0, 90, 180, 270
    assert h[1] > 5.0
    assert h[3] == pytest.approx(DIP_2M_DEG, abs=0.002)


def test_near_dem_is_used_within_near_range_and_far_dem_beyond():
    # A fine 10 m near grid keeps the wall's edge sharp (bilinear blurs it over one pixel).
    near_wall = grid(lambda X, Y: np.where(Y > SITE_Y + 2_000.0, 100.0, 0.0), half_width_m=6_000.0, pixel=10.0)
    # A ridge from 2 to 3 km north, only in the far DEM: within near range it must be ignored.
    far_wall = grid(lambda X, Y: np.where((Y > SITE_Y + 2_000.0) & (Y < SITE_Y + 3_000.0), 100.0, 0.0))
    expected = elevation_deg(2_000.0 / 1.0019, 100.0)  # about 2.8 deg
    assert run(near_wall, flat())[0] == pytest.approx(expected, abs=0.05)
    assert run(flat(), far_wall)[0] == pytest.approx(DIP_2M_DEG, abs=0.002)
    # Beyond near range, the far DEM is what counts.
    far_only = wall_north(8_000.0, 1_000.0)
    # 0.1 deg tolerance: the 50 m far grid blurs the edge by one pixel (about 0.05 deg at 8 km).
    assert run(flat(), far_only)[0] == pytest.approx(elevation_deg(8_000.0 / 1.0019, 1_000.0), abs=0.1)


def test_quantize_to_contract_int16_hundredths():
    q = quantize_horizons(np.array([[1.254, -0.0869, -90.0, 90.0]], dtype=np.float32))
    assert q.dtype == np.dtype("<i2")
    assert q.tolist() == [[125, -9, -9000, 9000]]
