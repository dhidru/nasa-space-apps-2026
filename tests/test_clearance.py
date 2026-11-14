import json
from datetime import datetime, timezone

import numpy as np
import pytest

from pipeline.clearance import horizon_elevation_at, load_positions, local_az_el
from pipeline.geometry import az_el_deg, site_position_km


def test_horizon_lookup_interpolates_between_quarter_degree_columns():
    hz = np.zeros((1, 1440))
    hz[0, 4] = 1.0  # azimuth 1.00 deg
    hz[0, 5] = 3.0  # azimuth 1.25 deg
    got = horizon_elevation_at(hz, np.array([[1.0, 1.125, 1.25, 1.1875]]))
    np.testing.assert_allclose(got, [[1.0, 2.0, 3.0, 2.5]])


def test_horizon_lookup_wraps_from_359_75_to_0_deg():
    hz = np.zeros((1, 1440))
    hz[0, 1439] = 2.0  # azimuth 359.75 deg
    hz[0, 0] = 4.0
    got = horizon_elevation_at(hz, np.array([[359.875, 360.0, 0.0]]))
    np.testing.assert_allclose(got, [[3.0, 4.0, 4.0]])


def test_horizon_lookup_reads_each_sites_own_row():
    hz = np.array([np.full(1440, 1.0), np.full(1440, -2.0)])
    got = horizon_elevation_at(hz, np.array([[10.0, 20.0], [10.0, 20.0]]))
    np.testing.assert_allclose(got, [[1.0, 1.0], [-2.0, -2.0]])


def test_earth_seen_from_85_s_on_the_prime_meridian_includes_parallax():
    # Earth 384,400 km away along +x (0 N, 0 E). From a site on the 1,737.4 km sphere at
    # 85 S, 0 E the zenith angle at the Moon's center is 85 deg, so without parallax the
    # elevation would be 5 deg. Worked by hand: atan2(384400 cos 85 - 1737.4,
    # 384400 sin 85) = 4.742 deg. The body lies toward the pole-opposite side: local north.
    az, el = local_az_el([-85.0], [0.0], [0.0], np.array([[384_400.0, 0.0, 0.0]]))
    assert az.shape == (1, 1)
    assert el[0, 0] == pytest.approx(4.742, abs=0.002)
    assert az[0, 0] == pytest.approx(0.0, abs=1e-6) or az[0, 0] == pytest.approx(360.0, abs=1e-6)


def test_a_body_due_east_has_azimuth_90():
    # At 0 E the local east direction is +y.
    az, el = local_az_el([-85.0], [0.0], [0.0], np.array([[0.0, 1.5e8, 0.0]]))
    assert az[0, 0] == pytest.approx(90.0, abs=1e-6)
    assert el[0, 0] == pytest.approx(0.0, abs=1e-3)


def test_many_sites_agree_with_the_single_site_geometry():
    rng = np.random.default_rng(1)
    lat = rng.uniform(-89.5, -84, 5)
    lon = rng.uniform(-180, 180, 5)
    h = rng.uniform(-3000, 3000, 5)
    bodies = rng.normal(size=(7, 3)) * np.array([1.5e8, 1.5e8, 4e6])
    az, el = local_az_el(lat, lon, h, bodies)
    for i in range(5):
        a1, e1 = az_el_deg(site_position_km(lat[i], lon[i], h[i]), bodies)
        np.testing.assert_allclose(el[i], e1, atol=1e-9)
        d = (az[i] - a1 + 180) % 360 - 180
        np.testing.assert_allclose(d, 0, atol=1e-9)


def _fake_year(folder, year, first_index):
    """Positions file whose Sun x value is the 600 s step count since 2026-01-01."""
    n = int((datetime(year + 1, 1, 1, tzinfo=timezone.utc) - datetime(year, 1, 1, tzinfo=timezone.utc))
            .total_seconds()) // 600
    arr = np.zeros((n, 2, 3), "<f4")
    arr[:, 0, 0] = np.arange(first_index, first_index + n)
    arr[:, 1, 2] = -1.0
    arr.tofile(folder / f"positions-{year}.bin")
    (folder / f"positions-{year}.json").write_text(json.dumps({
        "file": f"positions-{year}.bin", "dtype": "float32", "shape": [n, 2, 3],
        "axes": ["time", "body", "xyz"], "bodies": ["sun", "earth"], "units": "km", "scale": 1,
        "start_utc": f"{year}-01-01T00:00:00Z", "step_s": 600}))
    return n


def test_positions_for_a_stay_that_crosses_new_year_come_from_both_files(tmp_path):
    n26 = _fake_year(tmp_path, 2026, 0)
    _fake_year(tmp_path, 2027, n26)
    start = datetime(2026, 12, 31, 23, 40, tzinfo=timezone.utc)
    sun, earth = load_positions(tmp_path, start, 4)
    np.testing.assert_array_equal(sun[:, 0], [n26 - 2, n26 - 1, n26, n26 + 1])
    np.testing.assert_array_equal(earth, np.tile([0.0, 0.0, -1.0], (4, 1)))


def test_positions_outside_the_files_are_an_error(tmp_path):
    _fake_year(tmp_path, 2027, 0)
    with pytest.raises(ValueError, match="2028"):
        load_positions(tmp_path, datetime(2027, 12, 31, 23, 50, tzinfo=timezone.utc), 2)
