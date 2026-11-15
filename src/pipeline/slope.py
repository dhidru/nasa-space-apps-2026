"""Landing Slope and EVA Walkable Share of every Landing Site, written into its region's sites.json.

NASA's landing limit is a slope under 10 degrees at the 100 m scale (HLS25 slide 21,
docs/landing-criteria.md). Landing Slope is the steepest 100 m-scale slope anywhere in
the site's 100 m circle, because the lander can touch down anywhere in it (GLOSSARY.md,
data-contract §5.3). The 100 m-scale slope at a DEM pixel is the tilt of the
least-squares plane through the 5 x 5 pixels around it (a 100 m x 100 m patch of the
20 m LOLA DEM), measured on the ground: the stereographic map stretches the ground by
k = 1 + (rho / 2R)^2, so the map gradient is scaled up by k.

NASA's EVA limit is a slope under 20 degrees within 2 km (HLS25 slides 21, 24). EVA Walkable
Share is the share of the DEM pixels within 2 km of the site center whose 100 m-scale slope is
under 20 degrees. The slides give no scale for the EVA limit; 100 m is our choice, the same as
for Landing Slope.

Neither depends on the Landing Time, so they're computed once here and the browser
only reads them. pipeline.build rewrites sites.json without them, so rerun this after it.

    python -m pipeline.slope [DATA_DIR] [--region ID ...]   # default: every region with sites.json
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np

from .lola import DemGrid
from .projection import R_M

SITE_RADIUS_M = 100.0
BASELINE_M = 100.0
EVA_RADIUS_M = 2000.0
EVA_LIMIT_DEG = 20.0


def _plane_gradient(h: np.ndarray, pixel_m: float, w: int) -> tuple[np.ndarray, np.ndarray]:
    """Map gradient (the math dz/dx, dz/dy per map meter, not a Landing Slope) of the least-squares plane over the w x w pixels around each
    pixel; NaN where the window runs off the grid. Rows run toward -y."""
    r = w // 2
    c = np.arange(-r, r + 1) * pixel_m
    sxx = w * float((c**2).sum())
    n_rows, n_cols = h.shape
    gx = np.full(h.shape, np.nan)
    gy = np.full(h.shape, np.nan)
    if n_rows <= 2 * r or n_cols <= 2 * r:
        return gx, gy
    sx = np.zeros((n_rows - 2 * r, n_cols - 2 * r))
    sy = np.zeros_like(sx)
    for i in range(w):
        for j in range(w):
            patch = h[i:n_rows - 2 * r + i, j:n_cols - 2 * r + j]
            sx += c[j] * patch
            sy -= c[i] * patch
    gx[r:n_rows - r, r:n_cols - r] = sx / sxx
    gy[r:n_rows - r, r:n_cols - r] = sy / sxx
    return gx, gy


def _ground_slope_deg(dem: DemGrid, x: np.ndarray, y: np.ndarray, radius_m: float, baseline_m: float):
    """The baseline-scale ground slope (deg) of every DEM pixel within radius_m of any of the points x/y,
    on a crop of the DEM: (xs, ys, slope), with xs/ys the crop's pixel-center map coordinates."""
    px = dem.pixel_m
    w = max(3, int(round(baseline_m / px)) | 1)  # odd window: 5 pixels for 100 m at 20 m/px
    reach = radius_m + (w // 2 + 1) * px
    # Crop the DEM to the points plus the reach of their windows.
    c0 = max(0, int(np.floor((x.min() - reach - dem.x0_m) / px)))
    c1 = min(dem.heights_m.shape[1], int(np.ceil((x.max() + reach - dem.x0_m) / px)) + 1)
    r0 = max(0, int(np.floor((dem.y0_m - y.max() - reach) / px)))
    r1 = min(dem.heights_m.shape[0], int(np.ceil((dem.y0_m - y.min() + reach) / px)) + 1)
    h = dem.heights_m[r0:r1, c0:c1].astype(float)
    xs = dem.x0_m + np.arange(c0, c1) * px
    ys = dem.y0_m - np.arange(r0, r1) * px
    gx, gy = _plane_gradient(h, px, w)
    k = 1.0 + (np.hypot(xs[None, :], ys[:, None]) / (2.0 * R_M)) ** 2
    return xs, ys, np.degrees(np.arctan(k * np.hypot(gx, gy)))


def _reduce_over_circle(dem: DemGrid, x_m, y_m, radius_m: float, baseline_m: float, reduce) -> np.ndarray:
    """reduce(slopes) over the DEM pixels whose centers lie within radius_m of each site center x/y. Raises if a
    circle runs off the DEM: some of its pixels have no slope, or it holds under 90 % of the pixels it should."""
    x = np.atleast_1d(np.asarray(x_m, dtype=float))
    y = np.atleast_1d(np.asarray(y_m, dtype=float))
    xs, ys, slope = _ground_slope_deg(dem, x, y, radius_m, baseline_m)
    px = dem.pixel_m
    n_in = int(np.ceil(radius_m / px)) + 1
    out = np.empty(x.size)
    for i, (site_x, site_y) in enumerate(zip(x, y)):
        ci = int(round((site_x - xs[0]) / px))
        ri = int(round((ys[0] - site_y) / px))
        cs = slice(max(0, ci - n_in), ci + n_in + 1)
        rs = slice(max(0, ri - n_in), ri + n_in + 1)
        inside = np.hypot(xs[cs][None, :] - site_x, ys[rs][:, None] - site_y) <= radius_m + 1e-6
        in_circle = slope[rs, cs][inside]
        expected = np.pi * (radius_m / px) ** 2
        if in_circle.size < 0.9 * expected or np.isnan(in_circle).any():
            raise ValueError(f"the circle of {radius_m:.0f} m around ({site_x:.0f}, {site_y:.0f}) isn't fully inside the DEM")
        out[i] = reduce(in_circle)
    return out


def landing_slope_deg(dem: DemGrid, x_m, y_m, *, radius_m: float = SITE_RADIUS_M,
                      baseline_m: float = BASELINE_M) -> np.ndarray:
    """Landing Slope (deg) of the sites centered at map x/y: the steepest baseline-scale slope over the
    DEM pixels whose centers lie within radius_m of the site center."""
    return _reduce_over_circle(dem, x_m, y_m, radius_m, baseline_m, np.max)


def eva_walkable_fraction(dem: DemGrid, x_m, y_m, *, radius_m: float = EVA_RADIUS_M,
                          limit_deg: float = EVA_LIMIT_DEG, baseline_m: float = BASELINE_M) -> np.ndarray:
    """EVA Walkable Share (0-1) of the sites centered at map x/y: the share of the DEM pixels whose centers
    lie within radius_m of the site center with a baseline-scale slope under limit_deg."""
    return _reduce_over_circle(dem, x_m, y_m, radius_m, baseline_m, lambda s: float(np.mean(s < limit_deg)))


def write_slopes(data_dir: Path, region_id: str, dem: DemGrid) -> tuple[np.ndarray, np.ndarray]:
    """Add `landing_slope_deg` (2 decimals) and `eva_walkable_fraction` (rounded down to 4 decimals) to every site of the
    region's sites.json; `dem` is its 20 m DEM."""
    path = Path(data_dir) / "regions" / region_id / "sites.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    x, y = [s["x_m"] for s in doc["sites"]], [s["y_m"] for s in doc["sites"]]
    slopes = landing_slope_deg(dem, x, y, radius_m=float(doc["site_radius_m"]))
    walkable = eva_walkable_fraction(dem, x, y)
    for site, s, w in zip(doc["sites"], slopes, walkable):
        site["landing_slope_deg"] = round(float(s), 2)
        site["eva_walkable_fraction"] = math.floor(float(w) * 1e4 + 1e-9) / 1e4  # down, so any steep ground is < 1
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    return slopes, walkable


def main(argv: list[str] | None = None) -> None:
    from .build import RAW, REPO, near_band_loader
    from .regions import load_outlines

    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("data_dir", nargs="?", type=Path, default=REPO / "data" / "processed" / "site-data")
    p.add_argument("--region", action="append", dest="regions", help="repeatable (default: every region with sites)")
    a = p.parse_args(argv)
    regions = a.regions or sorted(f.parent.name for f in (a.data_dir / "regions").glob("*/sites.json"))
    outlines = load_outlines(next((RAW / "usgs" / "A3_9regions-lonlat-simplified").rglob("*.shp")))
    near = near_band_loader(RAW / "lola")
    for rid in regions:
        t0 = time.time()
        s, w = write_slopes(a.data_dir, rid, near(outlines[rid]))
        print(f"{rid}: {s.size} sites in {time.time() - t0:.0f} s, median {np.median(s):.1f} deg, "
              f"under 10 deg {np.mean(s < 10):.0%}, under 8 deg {np.mean(s < 8):.0%}; "
              f"EVA Walkable Share median {np.median(w):.0%}, range {w.min():.0%}-{w.max():.0%}")


if __name__ == "__main__":
    main()
