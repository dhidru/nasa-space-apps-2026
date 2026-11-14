"""Checks against the downloaded LOLA 80 m DEM (python -m pipeline.fetch lola80)."""

from pathlib import Path

import numpy as np
import pytest

from pipeline.horizon import compute_horizons
from pipeline.lola import open_lola
from pipeline.projection import lonlat_to_xy

pytestmark = pytest.mark.slow
LOLA = Path(__file__).resolve().parents[1] / "data" / "raw" / "lola"


@pytest.fixture(scope="module")
def far():
    if not (LOLA / "ldem_80s_80m.img").exists():
        pytest.skip("LDEM_80S_80M not downloaded")
    return open_lola(LOLA / "ldem_80s_80m.lbl", LOLA / "ldem_80s_80m.img")


def test_label_extremes_match_the_loaded_heights(far):
    # ldem_80s_80m.lbl: DERIVED_MINIMUM = -14592, DERIVED_MAXIMUM = 14052 (DN), x 0.5 m.
    assert float(far.heights_m.min()) == -7296.0
    assert float(far.heights_m.max()) == 7026.0


def test_shackleton_crater_floor_is_where_the_projection_puts_it(far):
    # Shackleton crater (about 21 km across) is centered near 89.7 S, 130 E. These values are
    # approximate and not from a checked source, so the tolerance is loose (5 km). If x/y or the
    # longitude sign were flipped, the deepest point near the pole would land in another quadrant.
    cx, cy = lonlat_to_xy(129.78, -89.67)
    xs = np.arange(-25_000, 25_001, 80.0)
    X, Y = np.meshgrid(xs, xs)
    H = far.height_at(X, Y)
    i = np.nanargmin(H)
    assert np.hypot(X.flat[i] - cx, Y.flat[i] - cy) < 5_000.0


def test_far_field_step_has_converged(far):
    # Four times finer steps beyond 5 km change no Horizon Elevation by more than 0.02 deg.
    pts = [lonlat_to_xy(lo, la) for lo, la in [(30, -84.8), (0, -86), (-10, -86.6), (110, -87.5)]]
    xs, ys = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
    h = far.height_at(xs, ys)
    a = compute_horizons(xs, ys, h, far, far, n_azimuths=360, far_rel_step=0.002)
    b = compute_horizons(xs, ys, h, far, far, n_azimuths=360, far_rel_step=0.0005)
    assert np.abs(b - a).max() < 0.02
