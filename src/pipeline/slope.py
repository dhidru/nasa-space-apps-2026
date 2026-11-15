"""Landing Slope of every Landing Site, written into its region's sites.json.

NASA's landing limit is a slope under 10 degrees at the 100 m scale (HLS25 slide 21,
docs/landing-criteria.md). Landing Slope is the steepest 100 m-scale slope anywhere in
the site's 100 m circle, because the lander can touch down anywhere in it (GLOSSARY.md,
data-contract §5.3). The 100 m-scale slope at a DEM pixel is the tilt of the
least-squares plane through the 5 x 5 pixels around it (a 100 m x 100 m patch of the
20 m LOLA DEM), measured on the ground: the stereographic map stretches the ground by
k = 1 + (rho / 2R)^2, so the map gradient is scaled up by k.

It doesn't depend on the Landing Time, so it's computed once here and the browser
only reads it. pipeline.build rewrites sites.json without it, so rerun this after it.

    python -m pipeline.slope [DATA_DIR] [--region ID ...]   # default: every region with sites.json
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from .lola import DemGrid
from .projection import R_M

SITE_RADIUS_M = 100.0
BASELINE_M = 100.0


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


def landing_slope_deg(dem: DemGrid, x_m, y_m, *, radius_m: float = SITE_RADIUS_M,
                      baseline_m: float = BASELINE_M) -> np.ndarray:
    """Landing Slope (deg) of the sites centered at map x/y: the steepest baseline-scale slope over the
    DEM pixels whose centers lie within radius_m of the site center."""
    x = np.atleast_1d(np.asarray(x_m, dtype=float))
    y = np.atleast_1d(np.asarray(y_m, dtype=float))
    px = dem.pixel_m
    w = max(3, int(round(baseline_m / px)) | 1)  # odd window: 5 pixels for 100 m at 20 m/px
    reach = radius_m + (w // 2 + 1) * px
    # Crop the DEM to the sites plus the reach of their windows.
    c0 = max(0, int(np.floor((x.min() - reach - dem.x0_m) / px)))
    c1 = min(dem.heights_m.shape[1], int(np.ceil((x.max() + reach - dem.x0_m) / px)) + 1)
    r0 = max(0, int(np.floor((dem.y0_m - y.max() - reach) / px)))
    r1 = min(dem.heights_m.shape[0], int(np.ceil((dem.y0_m - y.min() + reach) / px)) + 1)
    h = dem.heights_m[r0:r1, c0:c1].astype(float)
    xs = dem.x0_m + np.arange(c0, c1) * px
    ys = dem.y0_m - np.arange(r0, r1) * px
    gx, gy = _plane_gradient(h, px, w)
    k = 1.0 + (np.hypot(xs[None, :], ys[:, None]) / (2.0 * R_M)) ** 2
    slope = np.degrees(np.arctan(k * np.hypot(gx, gy)))

    n_in = int(np.ceil(radius_m / px)) + 1
    out = np.empty(x.size)
    for i, (site_x, site_y) in enumerate(zip(x, y)):
        ci = int(round((site_x - xs[0]) / px))
        ri = int(round((ys[0] - site_y) / px))
        cs = slice(max(0, ci - n_in), ci + n_in + 1)
        rs = slice(max(0, ri - n_in), ri + n_in + 1)
        inside = np.hypot(xs[cs][None, :] - site_x, ys[rs][:, None] - site_y) <= radius_m + 1e-6
        in_circle = slope[rs, cs][inside]
        if in_circle.size == 0 or np.isnan(in_circle).any():
            raise ValueError(f"the site at ({site_x:.0f}, {site_y:.0f}) isn't fully inside the DEM")
        out[i] = in_circle.max()
    return out


def write_landing_slope(data_dir: Path, region_id: str, dem: DemGrid) -> np.ndarray:
    """Add `landing_slope_deg` (2 decimals) to every site of the region's sites.json; `dem` is its 20 m DEM."""
    path = Path(data_dir) / "regions" / region_id / "sites.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    slopes = landing_slope_deg(dem, [s["x_m"] for s in doc["sites"]], [s["y_m"] for s in doc["sites"]],
                               radius_m=float(doc["site_radius_m"]))
    for site, s in zip(doc["sites"], slopes):
        site["landing_slope_deg"] = round(float(s), 2)
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    return slopes


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
        s = write_landing_slope(a.data_dir, rid, near(outlines[rid]))
        print(f"{rid}: {s.size} sites in {time.time() - t0:.0f} s, median {np.median(s):.1f} deg, "
              f"under 10 deg {np.mean(s < 10):.0%}, under 8 deg {np.mean(s < 8):.0%}")


if __name__ == "__main__":
    main()
