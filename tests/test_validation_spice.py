"""Design §10 item 1: our azimuth/elevation against SPICE's own azlcpo routine.

Our pipeline asks SPICE only for Sun and Earth vectors from the Moon's center (spkpos), stores
them as float32 (positions-<YYYY>.bin), and turns them into local azimuth/elevation with our own
code (clearance.local_az_el; the TypeScript port is tested against that). Here CSPICE's azlcpo
computes the same angles independently, from an observer on the surface, so a wrong frame,
sign, axis or azimuth convention in our chain would show up as a disagreement.
"""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.clearance import load_positions, local_az_el
from pipeline.geometry import site_position_km
from pipeline.projection import R_M

pytestmark = pytest.mark.slow

ROOT = Path(__file__).resolve().parents[1]
KERNELS = ROOT / "data" / "raw" / "spice"
SITE_DATA = ROOT / "data" / "processed" / "site-data"
OBSERVER_HEIGHT_M = 2.0
SPAN_START = datetime(2026, 11, 14, tzinfo=timezone.utc)
SPAN_DAYS = 365
TOLERANCE_DEG = 0.001  # measured 2026-11-14: worst case 3e-5 deg (Earth elevation)


@pytest.fixture(scope="module")
def spice():
    spiceypy = pytest.importorskip("spiceypy")
    names = ["naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
    if not all((KERNELS / n).exists() for n in names):
        pytest.skip("SPICE kernels not downloaded (python -m pipeline.fetch small)")
    for n in names:
        spiceypy.furnsh(str(KERNELS / n))
    # azlcpo's ELLIPSOID method needs the Moon's shape. We model it as the 1,737.4 km sphere
    # (projection.R_M), so the local vertical is the Moon-center-to-site line in both codes.
    spiceypy.pdpool("BODY301_RADII", [R_M / 1000.0] * 3)
    yield spiceypy
    spiceypy.kclear()


def _sites():
    doc = json.loads((SITE_DATA / "regions" / "mons-mouton" / "sites.json").read_text(encoding="utf-8"))
    s = doc["sites"]
    # Corners and middle of the grid, so the check covers its whole extent.
    return [s[0], s[79], s[len(s) // 2], s[-80], s[-1]]


def _times():
    # 25 times spread over the Supported Span, on the 600 s grid of the positions files.
    step = timedelta(days=SPAN_DAYS) / 24
    return [SPAN_START + timedelta(seconds=600 * round((step * k).total_seconds() / 600)) for k in range(25)]


@pytest.mark.parametrize("body", ["SUN", "EARTH"])
def test_our_azimuth_and_elevation_match_spice_azlcpo(spice, body):
    sites, times = _sites(), _times()
    ours_az = np.empty((len(sites), len(times)))
    ours_el = np.empty_like(ours_az)
    for j, t in enumerate(times):
        sun, earth = load_positions(SITE_DATA / "ephemeris", t, 1)
        vec = sun if body == "SUN" else earth
        az, el = local_az_el([s["lat_deg"] for s in sites], [s["lon_deg"] for s in sites],
                             [s["terrain_height_m"] + OBSERVER_HEIGHT_M for s in sites], vec)
        ours_az[:, j], ours_el[:, j] = az[:, 0], el[:, 0]

    for i, s in enumerate(sites):
        obs = site_position_km(s["lat_deg"], s["lon_deg"], s["terrain_height_m"] + OBSERVER_HEIGHT_M)
        for j, t in enumerate(times):
            et = spice.str2et(t.strftime("%Y-%m-%dT%H:%M:%S"))
            # Azimuth clockwise from north (azccld=False), elevation positive up (elplsz=True).
            state, _ = spice.azlcpo("ELLIPSOID", body, et, "LT+S", False, True, obs, "MOON", "MOON_ME")
            az, el = np.degrees(state[1]) % 360.0, np.degrees(state[2])
            d_az = (ours_az[i, j] - az + 180.0) % 360.0 - 180.0
            assert abs(d_az) < TOLERANCE_DEG, f"{body} azimuth at {s['site_id']} {t}: ours {ours_az[i, j]:.4f}, SPICE {az:.4f}"
            assert abs(ours_el[i, j] - el) < TOLERANCE_DEG, f"{body} elevation at {s['site_id']} {t}: ours {ours_el[i, j]:.4f}, SPICE {el:.4f}"
