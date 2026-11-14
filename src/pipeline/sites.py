"""Landing Site grid (design.md §4, data-contract §5.3).

Site centers sit on a global 200 m lattice at odd multiples of 100 m, so the
100 m-radius circles of neighbouring sites touch. A site belongs to a region if
its center is inside the region outline. Row 0 is the lattice row with the
largest y; ids are r<row>c<col>, counted from the top-left of the region's
lattice bounding box. The returned order (row-major) is the row order of
horizons.bin.gz.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .lola import DemGrid
from .projection import xy_to_lonlat


@dataclass(frozen=True)
class Site:
    site_id: str
    x_m: float
    y_m: float
    lat_deg: float
    lon_deg: float
    terrain_height_m: float


def points_in_polygon(x, y, ring) -> np.ndarray:
    """Even-odd rule; ring is a closed [n, 2] array of vertices."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    inside = np.zeros(x.shape, dtype=bool)
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        crosses = (y1 > y) != (y2 > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            x_at_y = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        inside ^= crosses & (x < x_at_y)
    return inside


def build_site_grid(outline_xy: np.ndarray, dem: DemGrid, spacing_m: float = 200.0) -> list[Site]:
    half = spacing_m / 2.0
    x_min, y_min = outline_xy.min(axis=0)
    x_max, y_max = outline_xy.max(axis=0)
    # Lattice centers: half + k * spacing.
    cols = np.arange(np.ceil((x_min - half) / spacing_m), np.floor((x_max - half) / spacing_m) + 1)
    rows = np.arange(np.floor((y_max - half) / spacing_m), np.ceil((y_min - half) / spacing_m) - 1, -1)
    xs = half + cols * spacing_m
    ys = half + rows * spacing_m
    X, Y = np.meshgrid(xs, ys)  # Y descends down the rows
    inside = points_in_polygon(X, Y, outline_xy)
    r_idx, c_idx = np.nonzero(inside)  # row-major order
    # Ids count from the first row / column that actually holds a site.
    r_idx0, c_idx0 = r_idx - r_idx.min(), c_idx - c_idx.min()
    px, py = X[r_idx, c_idx], Y[r_idx, c_idx]
    heights = dem.height_at(px, py)
    if np.isnan(heights).any():
        raise ValueError("some site centers are outside the DEM")
    lon, lat = xy_to_lonlat(px, py)
    return [
        Site(f"r{r:03d}c{c:03d}", float(x), float(y), float(la), float(lo), float(h))
        for r, c, x, y, la, lo, h in zip(r_idx0, c_idx0, px, py, lat, lon, heights)
    ]
