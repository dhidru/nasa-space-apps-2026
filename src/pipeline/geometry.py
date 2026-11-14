"""Local azimuth/elevation of a body seen from a site (data-contract §2, §6.2).

Vectors are MOON_ME, km. The local frame is east-north-up with "up" along the
line from the Moon's center through the site (the flat local horizontal of the
glossary); azimuth is clockwise from local north, 0-360.
"""

from __future__ import annotations

import numpy as np

from .projection import R_M


def site_position_km(lat_deg: float, lon_deg: float, height_m: float) -> np.ndarray:
    """MOON_ME position of a point `height_m` above the reference sphere."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    r = (R_M + height_m) / 1000.0
    return r * np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def enu_basis(site_km: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    up = site_km / np.linalg.norm(site_km)
    east = np.cross([0.0, 0.0, 1.0], up)
    east /= np.linalg.norm(east)
    north = np.cross(up, east)
    return east, north, up


def az_el_deg(site_km: np.ndarray, body_km: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Azimuth and elevation (degrees) of bodies at `body_km` [n, 3] seen from `site_km` [3]."""
    east, north, up = enu_basis(np.asarray(site_km, float))
    v = np.atleast_2d(body_km) - site_km
    e, n, u = v @ east, v @ north, v @ up
    az = np.degrees(np.arctan2(e, n)) % 360.0
    el = np.degrees(np.arctan2(u, np.hypot(e, n)))
    return az, el
