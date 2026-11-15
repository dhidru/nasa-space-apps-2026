"""Design §10 item 1, second half: our Sun and Earth paths against known facts about the Moon.

These checks use no outside dataset. The numbers come from NASA's Moon Fact Sheet
(Williams, NSSDCA, updated 2024-01-11; see ATTRIBUTIONS.md):
  - synodic period 29.53 days;
  - obliquity to orbit 6.68 deg and orbit inclination to the ecliptic 5.145 deg. By Cassini's
    laws the equator and the orbit tilt to opposite sides of the ecliptic, so the equator is
    6.68 - 5.145 = 1.535 deg from the ecliptic, and the Sun never strays further than that
    from the lunar equator;
  - Earth-Moon distance "roughly" 357,000 to 407,000 km.
They read the committed positions files and sites (data-contract §6.2) through the same code
the pipeline uses, over the whole Supported Span.
"""

from datetime import datetime, timezone
import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.clearance import load_positions, local_az_el

pytestmark = pytest.mark.slow

SITE_DATA = Path(__file__).resolve().parents[1] / "data" / "processed" / "site-data"
OBSERVER_HEIGHT_M = 2.0
SPAN_START = datetime(2026, 11, 14, tzinfo=timezone.utc)
SAMPLES_PER_DAY = 144  # 600 s steps
SPAN_DAYS = 365

SYNODIC_DAYS = 29.53
EQUATOR_TO_ECLIPTIC_DEG = 6.68 - 5.145


@pytest.fixture(scope="module")
def span():
    doc = json.loads((SITE_DATA / "regions" / "mons-mouton" / "sites.json").read_text(encoding="utf-8"))
    s = doc["sites"]
    sites = [s[0], s[len(s) // 2], s[-1]]
    lat = np.array([x["lat_deg"] for x in sites])
    lon = np.array([x["lon_deg"] for x in sites])
    h = np.array([x["terrain_height_m"] + OBSERVER_HEIGHT_M for x in sites])
    sun, earth = load_positions(SITE_DATA / "ephemeris", SPAN_START, SPAN_DAYS * SAMPLES_PER_DAY)
    sun_az, sun_el = local_az_el(lat, lon, h, sun)
    earth_az, earth_el = local_az_el(lat, lon, h, earth)
    return dict(lat=lat, lon=lon, sun=sun, earth=earth,
                sun_az=sun_az, sun_el=sun_el, earth_az=earth_az, earth_el=earth_el)


def _angle_diff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


def test_earth_moon_distance_stays_in_the_known_range(span):
    d = np.linalg.norm(span["earth"], axis=1)
    # Fact sheet: roughly 357,000 to 407,000 km. Allow 2,000 km for "roughly".
    assert d.min() > 355_000.0
    assert d.max() < 409_000.0


def test_sun_never_rises_higher_than_the_tilt_allows(span):
    # The Sun stays within 1.535 deg of the lunar equator, so at a site that is (90 - |lat|) deg
    # from the pole it can't get higher than that plus 1.535 deg, or lower than minus it.
    # 0.05 deg covers the rounding of the fact sheet values and the Sun's parallax.
    bound = EQUATOR_TO_ECLIPTIC_DEG + 90.0 - np.abs(span["lat"])
    peak = np.abs(span["sun_el"]).max(axis=1)
    assert np.all(peak < bound + 0.05)
    # A year covers a full draconic cycle (about 346.6 days), so the Sun nearly reaches the bound.
    assert np.all(span["sun_el"].max(axis=1) > bound - 0.2)


def test_sun_goes_once_around_the_sky_each_synodic_month_moving_east_to_west(span):
    turns = np.unwrap(np.radians(span["sun_az"]), axis=1)
    turns = (turns[:, -1] - turns[:, 0]) / (2 * np.pi)
    # Azimuth counts clockwise from north (north -> east). Seen from near the south pole the Sun
    # rises in the east, passes north and sets in the west, so azimuth goes down.
    assert np.allclose(turns, -SPAN_DAYS / SYNODIC_DAYS, atol=0.05)


def test_earth_stays_near_the_direction_of_the_sub_earth_point(span):
    # The Moon keeps one face to Earth, so Earth hangs over (0 N, 0 E) give or take libration
    # (Earth's elevation also wobbles by about the 6.68 deg obliquity to orbit). Expected
    # azimuth and elevation of a far body over (0 N, 0 E), by spherical trigonometry:
    phi, dlon = np.radians(span["lat"]), np.radians(-span["lon"])
    el0 = np.degrees(np.arcsin(np.cos(phi) * np.cos(dlon)))
    az0 = np.degrees(np.arctan2(np.sin(dlon), -np.sin(phi) * np.cos(dlon))) % 360.0
    # Measured 2026-11-14: up to 8.2 deg in azimuth and 6.9 deg in elevation. A flipped longitude
    # or a mirrored azimuth would be off by tens of degrees.
    assert np.abs(_angle_diff(span["earth_az"], az0[:, None])).max() < 9.0
    assert np.abs(span["earth_el"] - el0[:, None]).max() < 7.5


def _local_extrema(x, find_max, window):
    """Indices where x is the max (or min) of the surrounding +-window samples."""
    y = x if find_max else -x
    out = []
    for i in range(window, len(y) - window):
        if y[i] == y[i - window:i + window + 1].max():
            out.append(i)
    return np.array(out)


def test_sun_and_earth_line_up_at_full_moon_and_oppose_at_new_moon(span):
    sun, earth = span["sun"], span["earth"]
    cos = np.einsum("ij,ij->i", sun, earth) / (np.linalg.norm(sun, axis=1) * np.linalg.norm(earth, axis=1))
    separation = np.degrees(np.arccos(np.clip(cos, -1.0, 1.0)))
    window = 10 * SAMPLES_PER_DAY
    full = _local_extrema(separation, find_max=False, window=window)  # Earth between Moon and Sun
    new = _local_extrema(separation, find_max=True, window=window)   # Moon between Earth and Sun

    # Successive full moons and new moons are one synodic month apart (it varies by under a day).
    for idx in (full, new):
        assert len(idx) >= 11
        gaps_days = np.diff(idx) / SAMPLES_PER_DAY
        assert np.all(np.abs(gaps_days - SYNODIC_DAYS) < 0.8)

    # Full moon: from the Moon, the Sun is behind Earth, within about the 5.145 deg orbit tilt,
    # so their azimuths match closely. New moon: they are on opposite sides of the sky.
    daz = np.abs(_angle_diff(span["sun_az"], span["earth_az"]))
    assert np.all(separation[full] < 5.5)
    assert np.all(daz[:, full] < 6.0)
    assert np.all(separation[new] > 174.5)
    assert np.all(daz[:, new] > 174.0)
