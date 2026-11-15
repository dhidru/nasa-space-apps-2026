"""Landing Slope from our 20 m DEM against NASA's own LOLA slope map, LDSM_85S_40M.

Needs python -m pipeline.fetch lola20 mons-mouton and python -m pipeline.fetch ldsm85.

LDSM is a different measurement: slope along the laser tracks from three successive shots
(a 30-120 m baseline), resampled to 40 m pixels. Pixels off the tracks are fill (DN 0,
which would read as exactly 45 deg), about 69% of the map. So the two agree in bulk, not
pixel for pixel; docs/landing-criteria.md §3 has the numbers for every region LDSM reaches.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.build import near_band_loader
from pipeline.fetch import USGS_OUTLINES_ZIP
from pipeline.lola import read_label
from pipeline.regions import load_outlines
from pipeline.slope import landing_slope_deg

pytestmark = pytest.mark.slow
REPO = Path(__file__).resolve().parents[1]
LOLA = REPO / "data" / "raw" / "lola"
REGION = "mons-mouton"


def ldsm_worst_in_circles(x_m: np.ndarray, y_m: np.ndarray, radius_m: float) -> np.ndarray:
    """The steepest LDSM pixel (deg) whose center is within radius_m of each site; NaN if none has data."""
    label = read_label(LOLA / "ldsm_85s_40m.lbl")
    n, scale = int(label["LINES"]), float(label["MAP_SCALE"])
    off = float(label["LINE_PROJECTION_OFFSET"])
    assert float(label["SAMPLE_PROJECTION_OFFSET"]) == off
    dn = np.fromfile(LOLA / "ldsm_85s_40m.img", "<i2").reshape(n, n)
    slope = np.where(dn == 0, np.nan, dn * float(label["SCALING_FACTOR"]) + float(label["OFFSET"]))
    k = int(np.ceil(radius_m / scale)) + 1
    out = np.full(x_m.size, np.nan)
    for i, (x, y) in enumerate(zip(x_m, y_m)):
        s0, l0 = int(round(x / scale + off)), int(round(off - y / scale))
        ss, ll = np.arange(s0 - k, s0 + k + 1), np.arange(l0 - k, l0 + k + 1)
        inside = np.hypot((ss[None, :] - off) * scale - x, (off - ll[:, None]) * scale - y) <= radius_m
        v = slope[ll[0]:ll[-1] + 1, ss[0]:ss[-1] + 1][inside]
        if np.isfinite(v).any():
            out[i] = np.nanmax(v)
    return out


def test_mons_mouton_landing_slopes_agree_with_lola_ldsm():
    if not (LOLA / "ldsm_85s_40m.img").exists():
        pytest.skip("LDSM_85S_40M not downloaded")
    shp = next(USGS_OUTLINES_ZIP.with_suffix("").rglob("*.shp"), None)
    if shp is None:
        pytest.skip("USGS outlines not downloaded")
    sites = json.loads((REPO / "data/processed/site-data/regions" / REGION / "sites.json").read_text())["sites"]
    x = np.array([s["x_m"] for s in sites])
    y = np.array([s["y_m"] for s in sites])
    ours = landing_slope_deg(near_band_loader(LOLA)(load_outlines(shp)[REGION]), x, y)
    theirs = ldsm_worst_in_circles(x, y, 100.0)
    have = np.isfinite(theirs)
    assert have.mean() > 0.9  # 94 % of Mons Mouton sites have LDSM track data
    ours, theirs = ours[have], theirs[have]
    assert abs(np.median(ours) - np.median(theirs)) < 0.5
    assert np.corrcoef(ours, theirs)[0, 1] > 0.85
    assert np.mean((ours < 10) == (theirs < 10)) > 0.85
    # LDSM's sparse track pixels can miss the steepest spot in a circle, so if anything we're stricter:
    # 24.5 % of these sites are under 10 deg for us, 28.0 % for LDSM.
    assert np.mean(theirs < 10) - 0.05 < np.mean(ours < 10) <= np.mean(theirs < 10) + 0.01
