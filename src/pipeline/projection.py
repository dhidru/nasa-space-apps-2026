"""South polar stereographic projection of docs/data-contract.md §2.

rho = 2R tan(pi/4 + lat/2), x = rho sin(lon), y = rho cos(lon), on the
1,737,400 m sphere, true scale at the pole. Angles are degrees, longitudes
east-positive in [-180, 180).
"""

from __future__ import annotations

import numpy as np

R_M = 1_737_400.0  # reference sphere radius, meters


def wrap_lon(lon_deg):
    """Wrap longitudes (for example 0-360 sources) into [-180, 180)."""
    return (np.asarray(lon_deg, dtype=float) + 180.0) % 360.0 - 180.0


def lonlat_to_xy(lon_deg, lat_deg):
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    rho = 2.0 * R_M * np.tan(np.pi / 4.0 + lat / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy_to_lonlat(x_m, y_m):
    x = np.asarray(x_m, dtype=float)
    y = np.asarray(y_m, dtype=float)
    rho = np.hypot(x, y)
    lat = 2.0 * np.arctan(rho / (2.0 * R_M)) - np.pi / 2.0
    lon = np.arctan2(x, y)
    return wrap_lon(np.degrees(lon)), np.degrees(lat)
