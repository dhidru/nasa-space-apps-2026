"""Horizon computation by ray marching over the LOLA DEMs (design.md §5).

For each site and azimuth, walk outward along the great circle from the site
and keep the largest elevation angle of the terrain, measured from the flat
local horizontal plane (perpendicular to the Moon-center-to-site line) at the
observer, who stands Observer Height above the terrain. The geometry is exact
on the reference sphere, so the Moon's curvature is included.

Distances up to `near_max_m` sample the near (20 m) DEM, falling back to the
far DEM where the near one has no data; beyond that only the far (80 m) DEM.
Far-field steps grow with distance (`far_rel_step` x distance), which keeps the
angular sampling roughly even.
"""

from __future__ import annotations

import gzip
import math

import numba
import numpy as np

from .lola import DemGrid
from .projection import R_M, xy_to_lonlat


@numba.njit(cache=True, inline="always")
def _bilinear(h, x0, y0, pix, x, y):
    col = (x - x0) / pix
    row = (y0 - y) / pix
    n_rows, n_cols = h.shape
    if col < 0.0 or row < 0.0 or col > n_cols - 1 or row > n_rows - 1:
        return np.nan
    c0 = min(int(col), n_cols - 2)
    r0 = min(int(row), n_rows - 2)
    fc = col - c0
    fr = row - r0
    top = h[r0, c0] * (1.0 - fc) + h[r0, c0 + 1] * fc
    bottom = h[r0 + 1, c0] * (1.0 - fc) + h[r0 + 1, c0 + 1] * fc
    return top * (1.0 - fr) + bottom * fr


@numba.njit(parallel=True, cache=True)
def _march(lon, lat, h0, observer, az_rad, dist, n_near,
           hn, xn0, yn0, pn, hf, xf0, yf0, pf, out):
    R = R_M
    cos_t = np.cos(dist / R)
    sin_t = np.sin(dist / R)
    for i in numba.prange(lon.size):
        cl, sl = math.cos(lon[i]), math.sin(lon[i])
        cp, sp = math.cos(lat[i]), math.sin(lat[i])
        u0 = (cp * cl, cp * sl, sp)
        east = (-sl, cl, 0.0)
        north = (-sp * cl, -sp * sl, cp)
        rp = R + h0[i] + observer
        for a in range(az_rad.size):
            ca, sa = math.cos(az_rad[a]), math.sin(az_rad[a])
            e = (ca * north[0] + sa * east[0], ca * north[1] + sa * east[1], ca * north[2] + sa * east[2])
            best = -math.pi / 2
            for k in range(dist.size):
                ux = cos_t[k] * u0[0] + sin_t[k] * e[0]
                uy = cos_t[k] * u0[1] + sin_t[k] * e[1]
                uz = cos_t[k] * u0[2] + sin_t[k] * e[2]
                s = 2.0 * R / (1.0 - uz)  # south polar stereographic, data-contract §2
                x = s * uy
                y = s * ux
                ht = np.nan
                if k < n_near:
                    ht = _bilinear(hn, xn0, yn0, pn, x, y)
                if np.isnan(ht):
                    ht = _bilinear(hf, xf0, yf0, pf, x, y)
                if np.isnan(ht):
                    continue
                rt = R + ht
                el = math.atan2(rt * cos_t[k] - rp, rt * sin_t[k])
                if el > best:
                    best = el
            out[i, a] = math.degrees(best)


def sample_distances(near: DemGrid, far: DemGrid, near_max_m: float, far_max_m: float,
                     far_rel_step: float = 0.002) -> tuple[np.ndarray, int]:
    """Distances along each ray; the first n_near of them use the near DEM."""
    near_d = np.arange(near.pixel_m, near_max_m + 1e-9, near.pixel_m)
    far_d = []
    d = near_max_m
    while d < far_max_m:
        d += max(far.pixel_m, far_rel_step * d)
        far_d.append(min(d, far_max_m))
    return np.concatenate([near_d, np.asarray(far_d)]), near_d.size


def compute_horizons(x_m, y_m, terrain_height_m, near: DemGrid, far: DemGrid, *,
                     observer_height_m: float = 2.0, n_azimuths: int = 1440,
                     near_max_m: float = 5_000.0, far_max_m: float = 150_000.0,
                     far_rel_step: float = 0.002) -> np.ndarray:
    """Horizon Elevation in degrees, float32 [n_sites, n_azimuths]; azimuth k = k * 360 / n_azimuths."""
    lon, lat = xy_to_lonlat(np.asarray(x_m, float), np.asarray(y_m, float))
    dist, n_near = sample_distances(near, far, near_max_m, far_max_m, far_rel_step)
    az = np.radians(np.arange(n_azimuths) * 360.0 / n_azimuths)
    out = np.empty((lon.size, n_azimuths), dtype=np.float32)
    _march(np.radians(np.atleast_1d(lon)), np.radians(np.atleast_1d(lat)),
           np.asarray(terrain_height_m, float), float(observer_height_m), az, dist, n_near,
           near.heights_m, near.x0_m, near.y0_m, near.pixel_m,
           far.heights_m, far.x0_m, far.y0_m, far.pixel_m, out)
    return out


def compute_site_horizons(x_m, y_m, terrain_height_m, near: DemGrid, far: DemGrid, *,
                          radius_m: float = 100.0, **kw) -> np.ndarray:
    """Worst-case Horizon of each Landing Site, float32 [n_sites, n_azimuths] (design.md §5).

    The lander can touch down anywhere in the site's circle, so each azimuth keeps the highest
    Horizon Elevation seen from the center and from the four edge points `radius_m` north, south,
    east and west of it on the map, each at Observer Height above its own terrain. Edge points are
    shared with the neighbouring sites on the 200 m grid and are computed once.

    The Sun and Earth are far enough away that their direction is the same from all five points,
    so the lowest Clearance over the five is a body's elevation minus this Horizon. Each edge
    point's Horizon is read in the center's directions: near the pole, local north turns over
    100 m (by up to about 0.14 deg for our regions' sites). kw goes to compute_horizons.
    """
    x = np.atleast_1d(np.asarray(x_m, float))
    y = np.atleast_1d(np.asarray(y_m, float))
    offsets = np.array([[radius_m, 0.0], [-radius_m, 0.0], [0.0, radius_m], [0.0, -radius_m]])
    edge_x = x[:, None] + offsets[:, 0]  # [n_sites, 4]
    edge_y = y[:, None] + offsets[:, 1]
    # Neighbouring sites share edge points; compute each one once.
    keys = np.round(np.column_stack([edge_x.ravel(), edge_y.ravel()]) / _POINT_KEY_M).astype(np.int64)
    unique_keys, edge_row = np.unique(keys, axis=0, return_inverse=True)
    point_x, point_y = unique_keys[:, 0] * _POINT_KEY_M, unique_keys[:, 1] * _POINT_KEY_M
    point_h = near.height_at(point_x, point_y)
    point_h = np.where(np.isnan(point_h), far.height_at(point_x, point_y), point_h)
    if np.isnan(point_h).any():
        raise ValueError("some site edge points are outside both DEMs")
    centers = compute_horizons(x, y, terrain_height_m, near, far, **kw)
    edges = compute_horizons(point_x, point_y, point_h, near, far, **kw)
    # Column shift that reads each edge point's Horizon in its center's directions.
    shift = _azimuth_turn_deg(x[:, None], y[:, None], edge_x, edge_y) / (360.0 / centers.shape[1])
    _merge_worst(centers, edges, edge_row.reshape(x.size, 4).astype(np.int64), shift)
    return centers


_POINT_KEY_M = 0.1  # edge points closer than this on the map are the same point


def _unit_frame(x_m, y_m):
    lon, lat = xy_to_lonlat(x_m, y_m)
    lon, lat = np.radians(lon), np.radians(lat)
    north = np.stack([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)], axis=-1)
    east = np.stack([-np.sin(lon), np.cos(lon), np.zeros_like(lon)], axis=-1)
    return north, east


def _azimuth_turn_deg(x0, y0, x1, y1):
    """Azimuth, at point 1, of point 0's local north: add it to an azimuth at point 0 to get the
    same direction in space as an azimuth at point 1. For points d apart, the two local horizontal
    planes tilt by d / R against each other (0.003 deg for 100 m), so the turn is the same for
    every azimuth."""
    n0, _ = _unit_frame(np.broadcast_to(x0, np.shape(x1)), np.broadcast_to(y0, np.shape(y1)))
    n1, e1 = _unit_frame(x1, y1)
    return np.degrees(np.arctan2((n0 * e1).sum(-1), (n0 * n1).sum(-1)))


@numba.njit(parallel=True, cache=True)
def _merge_worst(centers, edges, rows, shift):
    """centers[i] = max(centers[i], each edge Horizon read at column k + shift), in place; wraps."""
    n_sites, n_az = centers.shape
    for i in numba.prange(n_sites):
        for j in range(rows.shape[1]):
            e = edges[rows[i, j]]
            s = shift[i, j]
            k0 = math.floor(s)
            f = s - k0
            for k in range(n_az):
                a = (k + k0) % n_az
                b = (a + 1) % n_az
                v = e[a] * (1.0 - f) + e[b] * f
                if v > centers[i, k]:
                    centers[i, k] = v


def quantize_horizons(horizons_deg: np.ndarray) -> np.ndarray:
    """To the horizons.bin encoding: little-endian int16 hundredths of a degree (data-contract §6.1)."""
    return np.round(np.asarray(horizons_deg, dtype=np.float64) * 100.0).astype("<i2")


def encode_horizons(q: np.ndarray) -> bytes:
    """Pack quantized Horizons for horizons.bin.gz (data-contract §6.1).

    Along each row (site), the first value is kept and every later one becomes the
    difference from its neighbour; then the whole array is gzipped. Stored values
    lie within +/-9000, so the differences fit in int16. mtime=0 keeps the output
    byte-for-byte repeatable.
    """
    q = np.asarray(q, dtype="<i2")
    delta = np.diff(q, axis=1, prepend=np.zeros((q.shape[0], 1), dtype="<i2")).astype("<i2")
    return gzip.compress(delta.tobytes(), compresslevel=9, mtime=0)


def decode_horizons(blob: bytes, shape) -> np.ndarray:
    """Inverse of encode_horizons: int16 hundredths of a degree, shape [n_sites, n_azimuths]."""
    delta = np.frombuffer(gzip.decompress(blob), dtype="<i2").reshape(shape)
    return np.cumsum(delta, axis=1, dtype=np.int32).astype("<i2")
