import json
from datetime import datetime, timezone

import numpy as np
import pytest

from pipeline.ephemeris import KERNEL_DIR, utc_steps, write_positions

pytestmark = pytest.mark.slow  # needs the SPICE kernels in data/raw/spice/


def test_utc_steps_cover_one_year_at_600_s():
    t = utc_steps(2027)
    assert len(t) == 365 * 144
    assert t[0] == datetime(2027, 1, 1, tzinfo=timezone.utc)
    assert t[-1] == datetime(2027, 12, 31, 23, 50, tzinfo=timezone.utc)
    assert len(utc_steps(2028)) == 366 * 144


@pytest.fixture(scope="module")
def positions_2027(tmp_path_factory):
    if not (KERNEL_DIR / "de440s.bsp").exists():
        pytest.skip("SPICE kernels not downloaded (python -m pipeline.fetch small)")
    out = tmp_path_factory.mktemp("eph")
    write_positions(2027, out)
    meta = json.loads((out / "positions-2027.json").read_text())
    arr = np.fromfile(out / "positions-2027.bin", dtype="<f4").reshape(meta["shape"])
    return meta, arr


def test_sidecar_follows_the_contract(positions_2027):
    meta, arr = positions_2027
    assert meta["file"] == "positions-2027.bin"
    assert meta["shape"] == [52560, 2, 3]
    assert meta["axes"] == ["time", "body", "xyz"]
    assert meta["bodies"] == ["sun", "earth"]
    assert meta["frame"] == "MOON_ME"
    assert meta["aberration_correction"] == "LT+S"
    assert meta["start_utc"] == "2027-01-01T00:00:00Z"
    assert meta["step_s"] == 600
    assert meta["mock"] is False
    assert arr.shape == (52560, 2, 3)


def test_distances_are_physical(positions_2027):
    _, arr = positions_2027
    sun_km = np.linalg.norm(arr[:, 0], axis=1)
    earth_km = np.linalg.norm(arr[:, 1], axis=1)
    assert 1.45e8 < sun_km.min() and sun_km.max() < 1.53e8
    # Lunar perigee/apogee range.
    assert 355_000 < earth_km.min() < 362_000
    assert 403_000 < earth_km.max() < 407_500


def test_earth_stays_near_the_moons_prime_meridian_and_sun_near_the_equator(positions_2027):
    # Optical libration keeps the sub-Earth point within about 8 deg of (0 N, 0 E) in MOON_ME;
    # the Sun's sub-solar latitude stays within about 1.6 deg (the Moon's axial tilt).
    _, arr = positions_2027
    e, s = arr[:, 1].astype(float), arr[:, 0].astype(float)
    e_lat = np.degrees(np.arcsin(e[:, 2] / np.linalg.norm(e, axis=1)))
    e_lon = np.degrees(np.arctan2(e[:, 1], e[:, 0]))
    s_lat = np.degrees(np.arcsin(s[:, 2] / np.linalg.norm(s, axis=1)))
    assert np.abs(e_lat).max() < 7.5 and np.abs(e_lat).max() > 5.0
    assert np.abs(e_lon).max() < 9.0
    assert np.abs(s_lat).max() < 1.7
