import math

import numpy as np
import pytest

from pipeline.projection import R_M, lonlat_to_xy, wrap_lon, xy_to_lonlat


def test_pole_is_origin():
    x, y = lonlat_to_xy(0.0, -90.0)
    assert x == pytest.approx(0.0, abs=1e-6)
    assert y == pytest.approx(0.0, abs=1e-6)


def test_lon_zero_is_plus_y_and_lon_90e_is_plus_x():
    # Contract §2: x = rho sin(lon), y = rho cos(lon), rho = 2R tan(pi/4 + lat/2).
    rho_85 = 2 * 1_737_400.0 * math.tan(math.pi / 4 + math.radians(-85.0) / 2)
    x, y = lonlat_to_xy(0.0, -85.0)
    assert (x, y) == pytest.approx((0.0, rho_85))
    x, y = lonlat_to_xy(90.0, -85.0)
    assert (x, y) == pytest.approx((rho_85, 0.0), abs=1e-6)
    # 85°S is roughly 151.7 km from the pole on the 1737.4 km sphere.
    assert rho_85 == pytest.approx(151_700, rel=2e-3)


def test_round_trip_lonlat_xy():
    lon = np.array([-179.9, -120.0, -45.5, 0.0, 30.0, 135.25, 179.9])
    lat = np.array([-89.99, -88.0, -86.5, -85.0, -84.0, -82.0, -80.0])
    x, y = lonlat_to_xy(lon, lat)
    lon2, lat2 = xy_to_lonlat(x, y)
    np.testing.assert_allclose(lon2, lon, atol=1e-9)
    np.testing.assert_allclose(lat2, lat, atol=1e-9)


def test_wrap_lon_converts_0_360_to_signed():
    np.testing.assert_allclose(
        wrap_lon(np.array([0.0, 90.0, 180.0, 270.0, 359.5, 360.0, -190.0])),
        [0.0, 90.0, -180.0, -90.0, -0.5, 0.0, 170.0],
    )


def test_reference_radius():
    assert R_M == 1_737_400.0
