"""Landing Region registry and the loader for the USGS region outlines.

The loader is the one conversion step for the USGS outlines (conventions card in
docs/data-contract.md §9): wrap longitudes to [-180, 180), match NASA names to
our permanent ids (data-contract §3), and project to map x/y.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import shapefile  # pyshp

from .projection import lonlat_to_xy, wrap_lon

NASA_SOURCE = {
    "name": "NASA news release 24-136, 2024-10-28 (9 regions)",
    "url": "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/",
}


@dataclass(frozen=True)
class Region:
    region_id: str
    nasa_name: str


# Order and names follow the NASA 2024 release. Ids never change (data-contract §3).
REGIONS = [
    Region("peak-near-cabeus-b", "Peak near Cabeus B"),
    Region("haworth", "Haworth"),
    Region("malapert-massif", "Malapert Massif"),
    Region("mons-mouton-plateau", "Mons Mouton Plateau"),
    Region("mons-mouton", "Mons Mouton"),
    Region("nobile-rim-1", "Nobile Rim 1"),
    Region("nobile-rim-2", "Nobile Rim 2"),
    Region("de-gerlache-rim-2", "de Gerlache Rim 2"),
    Region("slater-plain", "Slater Plain"),
]
_BY_SLUG = {r.region_id: r for r in REGIONS}


@dataclass(frozen=True)
class Outline:
    region_id: str
    source_name: str  # the name as written in the source file
    lonlat_deg: np.ndarray  # [n, 2] closed ring, lon in [-180, 180)
    xy_m: np.ndarray  # [n, 2] closed ring, map meters


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _check_prj(shp_path: Path) -> None:
    """The outlines must be geographic degrees on the 1,737,400 m sphere (conventions card)."""
    prj_path = Path(shp_path).with_suffix(".prj")
    if not prj_path.exists():
        raise ValueError(f"{prj_path} is missing; can't confirm the outlines' coordinate system")
    prj = prj_path.read_text(encoding="latin-1")
    if prj.lstrip().upper().startswith("PROJCS"):
        raise ValueError(f"{prj_path}: projected coordinates; expected geographic lon/lat")
    sphere = re.search(r'SPHEROID\["[^"]*",\s*([0-9.]+)\s*,\s*([0-9.]+)', prj)
    if not sphere or float(sphere.group(1)) != 1_737_400.0 or float(sphere.group(2)) != 0.0:
        raise ValueError(f"{prj_path}: expected a sphere of radius 1737400 m")
    if 'UNIT["Degree"' not in prj:
        raise ValueError(f"{prj_path}: expected units of degrees")


def _ring_area(ring: np.ndarray) -> float:
    x, y = ring[:, 0], ring[:, 1]
    return abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))) / 2.0


def load_outlines(shp_path: Path) -> dict[str, Outline]:
    _check_prj(shp_path)
    out: dict[str, Outline] = {}
    with shapefile.Reader(str(shp_path)) as r:
        for sr in r.iterShapeRecords():
            names = [v for v in sr.record if isinstance(v, str) and v.strip()]
            matches = [n for n in names if _slug(n) in _BY_SLUG]
            if len(matches) != 1:
                raise ValueError(f"can't match a region id to record {names}")
            region = _BY_SLUG[_slug(matches[0])]
            # Several parts: keep the ring with the largest area, and say what was dropped.
            parts = list(sr.shape.parts) + [len(sr.shape.points)]
            rings = [np.asarray(sr.shape.points[a:b], dtype=float) for a, b in zip(parts, parts[1:])]
            ring = max(rings, key=_ring_area)
            if len(rings) > 1:
                print(f"{region.region_id}: kept the largest ring, dropped {len(rings) - 1} smaller part(s)")
            if not np.array_equal(ring[0], ring[-1]):
                ring = np.vstack([ring, ring[:1]])
            lonlat = np.column_stack([wrap_lon(ring[:, 0]), ring[:, 1]])
            x, y = lonlat_to_xy(lonlat[:, 0], lonlat[:, 1])
            out[region.region_id] = Outline(region.region_id, matches[0], lonlat, np.column_stack([x, y]))
    return out
