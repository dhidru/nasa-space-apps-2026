"""Sun and Earth elevation and Clearance seen from many Landing Sites (design.md §5).

Clearance is a body's elevation minus the Horizon Elevation at the body's
azimuth (GLOSSARY.md). Elevation is from the flat local horizontal at the
observer; azimuth is clockwise from local north (data-contract §2).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .projection import R_M

STEP_S = 600
UTC_FORMAT = "%Y-%m-%dT%H:%M:%SZ"  # data-contract §2


def utc(t: datetime) -> str:
    return t.strftime(UTC_FORMAT)


def parse_utc(s: str) -> datetime:
    return datetime.strptime(s, UTC_FORMAT).replace(tzinfo=timezone.utc)


def load_positions(ephemeris_dir: Path, start: datetime, n_samples: int) -> tuple[np.ndarray, np.ndarray]:
    """Sun and Earth vectors (MOON_ME km, float64 [n_samples, 3]) at 600 s steps from `start`.

    Reads ephemeris/positions-<YYYY>.bin (data-contract §6.2), one file per UTC year, so a
    range that crosses New Year reads two files. `start` must be on the 600 s grid.
    """
    ephemeris_dir = Path(ephemeris_dir)
    out = np.empty((n_samples, 2, 3))
    t, done = start, 0
    while done < n_samples:
        side = ephemeris_dir / f"positions-{t.year}.json"
        if not side.exists():
            raise ValueError(f"no Sun/Earth positions for {t.year} ({side} is missing)")
        meta = json.loads(side.read_text(encoding="utf-8"))
        if meta["bodies"] != ["sun", "earth"] or meta["step_s"] != STEP_S:
            raise ValueError(f"{side}: unexpected bodies or step")
        offset_s = (t - parse_utc(meta["start_utc"])).total_seconds()
        if offset_s < 0 or offset_s % STEP_S:
            raise ValueError(f"{utc(t)} is not on the {STEP_S} s grid of {side.name}")
        arr = np.memmap(side.with_name(meta["file"]), dtype="<f4", mode="r", shape=tuple(meta["shape"]))
        i0 = int(offset_s // STEP_S)
        take = min(n_samples - done, arr.shape[0] - i0)
        if take <= 0:
            raise ValueError(f"{utc(t)} is past the end of {side.name}")
        out[done:done + take] = arr[i0:i0 + take] * float(meta["scale"])
        done += take
        t = start + timedelta(seconds=STEP_S * done)
    return out[:, 0], out[:, 1]


def horizon_elevation_at(horizons_deg: np.ndarray, azimuth_deg: np.ndarray) -> np.ndarray:
    """Horizon Elevation of site i at azimuth_deg[i, t], by linear interpolation that wraps at 360°.

    horizons_deg is [n_sites, n_azimuths] with column k at azimuth k * 360 / n_azimuths.
    """
    hz = np.asarray(horizons_deg)
    n_az = hz.shape[1]
    f = (np.asarray(azimuth_deg, float) % 360.0) * (n_az / 360.0)
    k0 = np.floor(f).astype(np.intp) % n_az
    w = f - np.floor(f)
    rows = np.arange(hz.shape[0])[:, None]
    return (1.0 - w) * hz[rows, k0] + w * hz[rows, (k0 + 1) % n_az]


def local_az_el(lat_deg, lon_deg, height_m, body_km: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Azimuth and elevation (degrees, [n_sites, n_times]) of bodies at body_km [n_times, 3].

    Each site is the point height_m above the 1,737.4 km sphere at (lat_deg, lon_deg); pass
    terrain height plus Observer Height. Vectors are MOON_ME km from the Moon's center. The
    local frame is east-north-up with up along the Moon-center-to-site line, the same frame
    as pipeline.geometry.
    """
    lat, lon = np.radians(np.asarray(lat_deg, float)), np.radians(np.asarray(lon_deg, float))
    r_km = (R_M + np.asarray(height_m, float)) / 1000.0
    cl, sl, cp, sp = np.cos(lon), np.sin(lon), np.cos(lat), np.sin(lat)
    up = np.stack([cp * cl, cp * sl, sp], axis=1)
    east = np.stack([-sl, cl, np.zeros_like(sl)], axis=1)
    north = np.stack([-sp * cl, -sp * sl, cp], axis=1)
    b = np.atleast_2d(np.asarray(body_km, float)).T  # [3, n_times]
    # The site vector is r_km * up, which is orthogonal to east and north.
    e = east @ b
    n = north @ b
    u = up @ b - r_km[:, None]
    az = np.degrees(np.arctan2(e, n)) % 360.0
    el = np.degrees(np.arctan2(u, np.hypot(e, n)))
    return az, el
