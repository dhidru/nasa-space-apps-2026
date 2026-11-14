import numpy as np
import pytest

from pipeline.lola import DemGrid
from pipeline.projection import xy_to_lonlat
from pipeline.sites import build_site_grid


def planar_dem(x_min, y_max, n, pixel, slope_x=0.01):
    """Height = slope_x * x on a grid whose row 0 is at y_max."""
    xs = x_min + pixel * np.arange(n)
    heights = np.tile((slope_x * xs).astype(np.float32), (n, 1))
    return DemGrid(heights_m=heights, x0_m=x_min, y0_m=y_max, pixel_m=pixel)


# A 1,000 m x 600 m rectangle; with 200 m spacing and centers at odd multiples of 100 m
# it holds 5 columns x 3 rows of centers.
RECT = np.array([[100_000, 50_000], [101_000, 50_000], [101_000, 50_600], [100_000, 50_600], [100_000, 50_000]], float)


def test_sites_fill_the_outline_on_a_200_m_grid():
    dem = planar_dem(99_000, 52_000, 200, 20.0)
    sites = build_site_grid(RECT, dem, spacing_m=200.0)
    assert len(sites) == 15
    xs = sorted({s.x_m for s in sites})
    ys = sorted({s.y_m for s in sites})
    assert xs == [100_100, 100_300, 100_500, 100_700, 100_900]
    assert ys == [50_100, 50_300, 50_500]


def test_ids_and_order_are_row_major_from_the_top():
    dem = planar_dem(99_000, 52_000, 200, 20.0)
    sites = build_site_grid(RECT, dem, spacing_m=200.0)
    assert [s.site_id for s in sites[:6]] == ["r000c000", "r000c001", "r000c002", "r000c003", "r000c004", "r001c000"]
    assert sites[0].y_m == 50_500  # row 0 has the largest y
    assert sites[0].x_m == 100_100
    assert sites[-1].site_id == "r002c004"


def test_only_centers_inside_a_non_rectangular_outline():
    # Right triangle with the hypotenuse running from (100000, 50600) to (101000, 50000).
    tri = np.array([[100_000, 50_000], [101_000, 50_000], [100_000, 50_600], [100_000, 50_000]], float)
    dem = planar_dem(99_000, 52_000, 200, 20.0)
    sites = build_site_grid(tri, dem, spacing_m=200.0)
    for s in sites:
        assert (s.x_m - 100_000) / 1000 + (s.y_m - 50_000) / 600 < 1
    assert ("r002c000" in {s.site_id for s in sites})  # bottom-left corner (100100, 50100) is inside
    assert len(sites) == 7  # 4 + 2 + 1 per row, bottom to top


def test_terrain_height_and_lat_lon_per_site():
    dem = planar_dem(99_000, 52_000, 200, 20.0, slope_x=0.01)
    s = build_site_grid(RECT, dem, spacing_m=200.0)[0]
    assert s.terrain_height_m == pytest.approx(0.01 * 100_100, abs=1e-3)
    lon, lat = xy_to_lonlat(s.x_m, s.y_m)
    assert (s.lon_deg, s.lat_deg) == pytest.approx((lon, lat))
