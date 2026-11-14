import numpy as np
import pytest

from pipeline.geometry import az_el_deg, site_position_km

FAR = 1.0e8  # km, "at infinity" for these checks


def test_site_position_is_on_the_sphere_plus_height():
    p = site_position_km(lat_deg=0.0, lon_deg=90.0, height_m=1000.0)
    assert p == pytest.approx((0.0, 1738.4, 0.0), abs=1e-9)


def test_az_el_at_the_equator():
    site = site_position_km(0.0, 0.0, 0.0)  # on +x
    az, el = az_el_deg(site, np.array([[FAR, 0, 0], [0, 0, FAR], [0, FAR, 0], [0, -FAR, 0]]))
    assert el[0] == pytest.approx(90.0)
    assert (az[1], el[1]) == pytest.approx((0.0, 0.0), abs=1e-3)  # +z is north on the horizon
    assert (az[2], el[2]) == pytest.approx((90.0, 0.0), abs=1e-3)  # +y is east
    assert (az[3], el[3]) == pytest.approx((270.0, 0.0), abs=1e-3)


def test_az_el_at_a_south_polar_site():
    # At 85 S, 0 E the local "up" is (cos 85, 0, -sin 85). A body far along +x is 5 deg up,
    # due north (away from the pole); far along -x it is 5 deg below, due south; far along
    # -z (below the south pole) it is 85 deg up.
    site = site_position_km(-85.0, 0.0, 0.0)
    az, el = az_el_deg(site, np.array([[FAR, 0.0, 0.0], [-FAR, 0.0, 0.0], [0.0, 0.0, -FAR]]))
    assert (az[0], el[0]) == pytest.approx((0.0, 5.0), abs=1e-3)
    assert (az[1], el[1]) == pytest.approx((180.0, -5.0), abs=1e-3)
    assert el[2] == pytest.approx(85.0, abs=1e-3)


def test_parallax_uses_the_site_position_not_the_moon_center():
    # Body 10 Moon radii out along +x; site on +y. From the Moon's center the body would sit
    # exactly on this site's horizontal plane (el 0). From the site itself the line of sight
    # is (10R, -R, 0), so el = -asin(1 / sqrt(101)) = -5.711 deg.
    body = np.array([[17374.0, 0.0, 0.0]])
    _, el = az_el_deg(site_position_km(0.0, 90.0, 0.0), body)
    assert el[0] == pytest.approx(-np.degrees(np.arcsin(1 / np.sqrt(101))), abs=1e-6)
