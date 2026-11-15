"""Generate MOCK data in the format of docs/data-contract.md (schema version 1).

Everything here is synthetic. Region locations, terrain, Horizons and the
Sun/Earth motion are made up to look plausible. Never use this output for real
planning. Every file is marked "mock": true.

Uses only the Python standard library. Run from the repo root:

    python contract/mock/generate_mock.py

Output goes to contract/mock/data/. The .bin and .bin.gz files are git-ignored because of
their size; rerun the script to get them.
"""

from __future__ import annotations

import array
import gzip
import json
import math
import random
import struct
import sys
import zlib
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCHEMA_VERSION = 1
R_M = 1_737_400.0  # reference sphere radius, meters
OUT = Path(__file__).resolve().parent / "data"

DEMO_REGION = "mons-mouton"
GRID_N = 75  # 75 x 75 sites
GRID_SPACING_M = 200.0
SITE_RADIUS_M = 100.0
OBSERVER_HEIGHT_M = 2.0
N_AZ = 1440
AZ_STEP_DEG = 0.25
STEP_S = 600
STAY_SAMPLES = 7 * 24 * 3600 // STEP_S + 1  # 1009: start and end both sampled
TOP_N = 10
TOP_SEPARATION_M = 2000.0
MERGE_GAP_H = 24.0

LANDING_TIME = datetime(2027, 3, 1, tzinfo=timezone.utc)
SEARCH_START = datetime(2026, 11, 14, tzinfo=timezone.utc)  # Supported Span, data-contract §2
SEARCH_END = datetime(2027, 11, 14, tzinfo=timezone.utc)  # exclusive
EPHEMERIS_YEAR = 2027

NASA_SOURCE = {
    "name": "NASA news release 24-136, 2024-10-28 (9 regions)",
    "url": "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/",
}

# NASA names from the 2024 release. Centers are PLACEHOLDERS, not real locations.
REGIONS = [
    ("peak-near-cabeus-b", "Peak near Cabeus B", -84.6, -50.0),
    ("haworth", "Haworth", -86.6, -10.0),
    ("malapert-massif", "Malapert Massif", -86.0, 2.0),
    ("mons-mouton-plateau", "Mons Mouton Plateau", -85.0, 30.0),
    ("mons-mouton", "Mons Mouton", -84.8, 45.0),
    ("nobile-rim-1", "Nobile Rim 1", -85.3, 60.0),
    ("nobile-rim-2", "Nobile Rim 2", -84.5, 75.0),
    ("de-gerlache-rim-2", "de Gerlache Rim 2", -88.5, -80.0),
    ("slater-plain", "Slater Plain", -87.5, 110.0),
]

# Synthetic "mountains" around the demo region: (dx_m, dy_m, height_m, radius_m),
# relative to the region center on the map.
MOUNTAINS = [
    (-20_000, 25_000, 2_500, 5_000),
    (30_000, 10_000, 3_000, 6_000),
    (5_000, -40_000, 4_000, 8_000),
    (-35_000, -15_000, 2_000, 5_000),
    (60_000, 60_000, 5_000, 10_000),
    (3_000, 2_000, 600, 1_500),  # hill inside the region
    (-5_000, -4_500, 400, 1_200),  # hill inside the region
]
PLATEAU_BASE_M = 1_500.0

# Synthetic sky motion (shared by all sites; real values differ slightly per site).
SYNODIC_D = 29.530589
EARTH_LIB_D = 27.212
SUN_DECL_D = 346.62
MID_STAY = LANDING_TIME + timedelta(days=3.5)
EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


# ---------------------------------------------------------------- helpers

def utc(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def compact(t: datetime) -> str:
    return t.strftime("%Y%m%dT%H%MZ")


def ll_to_xy(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    rho = 2 * R_M * math.tan(math.pi / 4 + math.radians(lat_deg) / 2)
    lam = math.radians(lon_deg)
    return rho * math.sin(lam), rho * math.cos(lam)


def xy_to_ll(x: float, y: float) -> tuple[float, float]:
    rho = math.hypot(x, y)
    lat = math.degrees(2 * math.atan(rho / (2 * R_M)) - math.pi / 2)
    lon = math.degrees(math.atan2(x, y))
    return lat, lon


def r(v: float, nd: int = 3) -> float:
    return round(v, nd)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def write_bin(path: Path, arr: array.array) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if sys.byteorder != "little":
        arr = array.array(arr.typecode, arr)
        arr.byteswap()
    with path.open("wb") as f:
        arr.tofile(f)


def write_packed_horizons(path: Path, h: array.array, n_az: int) -> None:
    """horizons.bin.gz: per-row deltas along azimuth, then gzip (data-contract §6.1)."""
    delta = array.array("h", h)
    for i in range(len(h) // n_az):
        for k in range(1, n_az):
            j = i * n_az + k
            delta[j] = h[j] - h[j - 1]
    if sys.byteorder != "little":
        delta.byteswap()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(delta.tobytes(), compresslevel=9, mtime=0))


def write_png_gray(path: Path, width: int, height: int, pixels: bytearray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = bytearray()
    for row in range(height):
        raw.append(0)
        raw += pixels[row * width:(row + 1) * width]
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def local_axes(x: float, y: float) -> tuple[tuple[float, float], tuple[float, float]]:
    """Unit north and east vectors on the map at (x, y). North points away from the pole."""
    rho = math.hypot(x, y)
    north = (x / rho, y / rho)
    east = (y / rho, -x / rho)
    return north, east


# ---------------------------------------------------------------- terrain

def terrain_height(x: float, y: float, cx: float, cy: float) -> float:
    h = PLATEAU_BASE_M + 0.004 * (x - cx) - 0.003 * (y - cy)
    for dx, dy, mh, mr in MOUNTAINS:
        d2 = (x - cx - dx) ** 2 + (y - cy - dy) ** 2
        h += mh * math.exp(-d2 / (2 * mr * mr))
    return h


def hillshade(width: int, height: int, extent: list[float], height_fn) -> bytearray:
    xmin, ymin, xmax, ymax = extent
    px = (xmax - xmin) / width
    grid = [[height_fn(xmin + (i + 0.5) * px, ymax - (j + 0.5) * px) for i in range(width)] for j in range(height)]
    az, alt = math.radians(315), math.radians(35)
    out = bytearray(width * height)
    for j in range(height):
        for i in range(width):
            dzdx = (grid[j][min(i + 1, width - 1)] - grid[j][max(i - 1, 0)]) / (2 * px)
            dzdy = (grid[max(j - 1, 0)][i] - grid[min(j + 1, height - 1)][i]) / (2 * px)
            slope = math.atan(math.hypot(dzdx, dzdy) * 3)
            aspect = math.atan2(dzdy, -dzdx)
            v = math.sin(alt) * math.cos(slope) + math.cos(alt) * math.sin(slope) * math.cos(az - aspect)
            out[j * width + i] = max(0, min(255, int(40 + 200 * v)))
    return out


# ---------------------------------------------------------------- sky

def days(t: datetime) -> float:
    return (t - EPOCH).total_seconds() / 86400.0


def sun_az_el(t: datetime) -> tuple[float, float]:
    d = days(t) - days(MID_STAY)
    az = (360.0 * d / SYNODIC_D) % 360.0
    decl = 1.54 * math.cos(2 * math.pi * d / SUN_DECL_D)
    el = 5.0 * math.cos(math.radians(az)) + decl
    return az, el


def earth_az_el(t: datetime) -> tuple[float, float]:
    d = days(t) - days(MID_STAY)
    az = (330.0 + 6.0 * math.sin(2 * math.pi * d / 27.55)) % 360.0
    el = 2.5 + 6.7 * math.cos(2 * math.pi * d / EARTH_LIB_D)
    return az, el


def horizon_at(h: array.array, row: int, az: float) -> float:
    """Linear interpolation in the stored (centi-degree) Horizon, wrapping at 360."""
    f = (az % 360.0) / AZ_STEP_DEG
    k0 = int(f) % N_AZ
    k1 = (k0 + 1) % N_AZ
    w = f - int(f)
    base = row * N_AZ
    return ((1 - w) * h[base + k0] + w * h[base + k1]) * 0.01


# ---------------------------------------------------------------- build

def build_regions() -> dict:
    regions = []
    for rid, name, lat, lon in REGIONS:
        x, y = ll_to_xy(lat, lon)
        regions.append({
            "id": rid,
            "display_name": name,
            "nasa_name": name,
            "former_names": [],
            "center": {"lat_deg": lat, "lon_deg": lon, "x_m": r(x, 1), "y_m": r(y, 1)},
            "has_site_data": rid == DEMO_REGION,
            "outline": f"regions/{rid}/outline.geojson",
            "basemap": f"regions/{rid}/basemap.json",
        })
    return {"schema_version": SCHEMA_VERSION, "mock": True, "source": NASA_SOURCE, "regions": regions}


def region_extent(cx: float, cy: float) -> list[float]:
    half = GRID_N * GRID_SPACING_M / 2
    return [r(cx - half, 1), r(cy - half, 1), r(cx + half, 1), r(cy + half, 1)]


def write_outline(rid: str, extent: list[float]) -> None:
    xmin, ymin, xmax, ymax = extent
    ring = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax], [xmin, ymin]]
    write_json(OUT / "regions" / rid / "outline.geojson", {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"schema_version": SCHEMA_VERSION, "mock": True, "region_id": rid,
                           "crs": "lunar-south-polar-stereographic-m"},
        }],
    })


def write_basemap(folder: Path, extent: list[float], width: int, height_fn) -> None:
    px = (extent[2] - extent[0]) / width
    write_png_gray(folder / "basemap.png", width, width, hillshade(width, width, extent, height_fn))
    write_json(folder / "basemap.json", {
        "schema_version": SCHEMA_VERSION, "mock": True, "image": "basemap.png", "extent_m": extent,
        "pixel_size_m": r(px, 3), "width_px": width, "height_px": width,
        "source": "MOCK synthetic hillshade (not LOLA data)",
    })


def build_sites(cx: float, cy: float) -> list[dict]:
    sites = []
    mid = (GRID_N - 1) / 2
    for row in range(GRID_N):
        for col in range(GRID_N):
            x = cx + (col - mid) * GRID_SPACING_M
            y = cy + (mid - row) * GRID_SPACING_M
            lat, lon = xy_to_ll(x, y)
            sites.append({"site_id": f"r{row:03d}c{col:03d}", "x_m": r(x, 1), "y_m": r(y, 1),
                          "lat_deg": r(lat, 6), "lon_deg": r(lon, 6),
                          "terrain_height_m": r(terrain_height(x, y, cx, cy), 1),
                          "landing_slope_deg": r(mock_landing_slope(x, y, cx, cy), 2),
                          "eva_walkable_fraction": r(mock_eva_walkable_fraction(x, y, cx, cy), 4)})
    return sites


def mock_landing_slope(x: float, y: float, cx: float, cy: float) -> float:
    """Approximate Landing Slope (data-contract §5.3): the steepest 100 m central-difference slope at the
    center and 8 points 60 m out. The real pipeline fits a plane to every 20 m DEM pixel in the circle."""
    worst = 0.0
    for k in range(9):
        px = x + (60 * math.cos(k * math.pi / 4) if k else 0.0)
        py = y + (60 * math.sin(k * math.pi / 4) if k else 0.0)
        worst = max(worst, slope_100m_deg(px, py, cx, cy))
    return worst


def slope_100m_deg(x: float, y: float, cx: float, cy: float) -> float:
    """Ground slope (deg) at x/y from 100 m central differences of the mock terrain."""
    gx = (terrain_height(x + 50, y, cx, cy) - terrain_height(x - 50, y, cx, cy)) / 100
    gy = (terrain_height(x, y + 50, cx, cy) - terrain_height(x, y - 50, cx, cy)) / 100
    return math.degrees(math.atan(math.hypot(gx, gy)))


def mock_eva_walkable_fraction(x: float, y: float, cx: float, cy: float) -> float:
    """Approximate EVA Walkable Share (data-contract §5.3): the share of points on a 250 m grid within 2 km
    whose 100 m central-difference slope is under 20 deg. The real pipeline uses every 20 m DEM pixel."""
    n = walkable = 0
    for i in range(-8, 9):
        for j in range(-8, 9):
            if math.hypot(i, j) * 250 <= 2000:
                n += 1
                walkable += slope_100m_deg(x + i * 250, y + j * 250, cx, cy) < 20
    return walkable / n


def build_horizons(sites: list[dict], cx: float, cy: float) -> array.array:
    rng = random.Random(42)
    base_table = [-0.15 + 0.25 * math.sin(math.radians(k * AZ_STEP_DEG) * 3)
                  + 0.1 * math.sin(math.radians(k * AZ_STEP_DEG) * 11) for k in range(N_AZ)]
    out = array.array("h", bytes(2 * len(sites) * N_AZ))
    for i, s in enumerate(sites):
        x, y, h0 = s["x_m"], s["y_m"], s["terrain_height_m"] + OBSERVER_HEIGHT_M
        north, east = local_axes(x, y)
        shift = rng.randrange(N_AZ)
        prof = [base_table[(k + shift) % N_AZ] for k in range(N_AZ)]
        for dx, dy, mh, mr in MOUNTAINS:
            vx, vy = cx + dx - x, cy + dy - y
            dist = math.hypot(vx, vy)
            if dist < 300:
                continue
            peak = PLATEAU_BASE_M + mh
            el = math.degrees(math.atan((peak - h0) / dist) - dist / (2 * R_M))
            if el <= -1.0:
                continue
            az = math.degrees(math.atan2(vx * east[0] + vy * east[1], vx * north[0] + vy * north[1])) % 360
            sigma = max(0.3, math.degrees(math.atan(mr / dist)))
            span = int(4 * sigma / AZ_STEP_DEG) + 1
            k_c = int(round(az / AZ_STEP_DEG))
            for dk in range(-span, span + 1):
                k = (k_c + dk) % N_AZ
                delta = dk * AZ_STEP_DEG - (az - k_c * AZ_STEP_DEG)
                v = el * math.exp(-0.5 * (delta / sigma) ** 2)
                if v > prof[k]:
                    prof[k] = v
        base = i * N_AZ
        for k in range(N_AZ):
            out[base + k] = int(round(prof[k] * 100))
    return out


def body_stats(el: list[float], clr: list[float], times: list[datetime]) -> dict:
    n = len(el)
    los = [c > 0 for c in clr]
    first_loss = next((utc(times[i]) for i, ok in enumerate(los) if not ok), None)
    n_los = sum(los)
    return {
        "min_elevation_deg": r(min(el)), "mean_elevation_deg": r(sum(el) / n), "max_elevation_deg": r(max(el)),
        "min_clearance_deg": r(min(clr)), "mean_clearance_deg": r(sum(clr) / n), "max_clearance_deg": r(max(clr)),
        "los_fraction": r(n_los / n, 4), "los_duration_h": r(n_los * STEP_S / 3600, 2),
        "first_los_loss_utc": first_loss,
    }


def rank_key(e: dict):
    if e["coverage"] == "full":
        mean_c = (e["sun"]["mean_clearance_deg"] + e["earth"]["mean_clearance_deg"]) / 2
        return (0, -e["worst_case_min_clearance_deg"], -mean_c)
    return (1, -min(e["sun"]["los_fraction"], e["earth"]["los_fraction"]), 0)


def build_ranking(sites, horizons, times, sun, earth):
    entries = []
    for i, s in enumerate(sites):
        sc = [sun[t][1] - horizon_at(horizons, i, sun[t][0]) for t in range(len(times))]
        ec = [earth[t][1] - horizon_at(horizons, i, earth[t][0]) for t in range(len(times))]
        ss = body_stats([v[1] for v in sun], sc, times)
        es = body_stats([v[1] for v in earth], ec, times)
        full = ss["los_fraction"] == 1 and es["los_fraction"] == 1
        entries.append({"site_id": s["site_id"], "rank": 0, "coverage": "full" if full else "partial",
                        "worst_case_min_clearance_deg": r(min(ss["min_clearance_deg"], es["min_clearance_deg"])),
                        "top": False, "sun": ss, "earth": es, "_i": i})
    entries.sort(key=rank_key)
    chosen: list[dict] = []
    for e in entries:
        if len(chosen) == TOP_N:
            break
        s = sites[e["_i"]]
        if all(math.hypot(s["x_m"] - sites[c["_i"]]["x_m"], s["y_m"] - sites[c["_i"]]["y_m"]) >= TOP_SEPARATION_M
               for c in chosen):
            e["top"] = True
            chosen.append(e)
    for n, e in enumerate(entries, start=1):
        e["rank"] = n
    return entries, [e["_i"] for e in chosen]


def build_site_detail(rid, site, row, horizons, times, sun, earth, entry):
    def series(body):
        return {"azimuth_deg": [r(a) for a, _ in body], "elevation_deg": [r(e) for _, e in body],
                "horizon_elevation_deg": [r(horizon_at(horizons, row, a)) for a, _ in body]}

    return {
        "schema_version": SCHEMA_VERSION, "mock": True, "region_id": rid, "site_id": site["site_id"],
        "landing_time_utc": utc(times[0]), "stay_end_utc": utc(times[-1]), "step_s": STEP_S,
        "n_samples": len(times), "coverage": entry["coverage"],
        "worst_case_min_clearance_deg": entry["worst_case_min_clearance_deg"],
        "horizon": {"azimuth_start_deg": 0, "azimuth_step_deg": AZ_STEP_DEG,
                    "elevation_deg": [horizons[row * N_AZ + k] / 100 for k in range(N_AZ)]},
        "series": {"time_utc": [utc(t) for t in times], "sun": series(sun), "earth": series(earth)},
        "stats": {"sun": entry["sun"], "earth": entry["earth"]},
    }


def add_timing_robustness(sites: list[dict], horizons: array.array, step_h: int = 6) -> None:
    """Timing Robustness (data-contract §5.3) for every site. The real pipeline checks every
    10-minute Landing Time; this mock samples every `step_h` hours to stay fast in pure Python."""
    step_s = step_h * 3600
    stay = (STAY_SAMPLES - 1) * STEP_S // step_s + 1  # the same 7 days, at the coarser step
    n_land = int((SEARCH_END - SEARCH_START).total_seconds() // step_s)
    sky = [(sun_az_el(t), earth_az_el(t))
           for t in (SEARCH_START + timedelta(seconds=j * step_s) for j in range(n_land + stay - 1))]
    for row, site in enumerate(sites):
        prefix = [0]
        for (sa, se), (ea, ee) in sky:
            blocked = min(se - horizon_at(horizons, row, sa), ee - horizon_at(horizons, row, ea)) <= 0
            prefix.append(prefix[-1] + blocked)
        n_full = sum(prefix[j + stay] == prefix[j] for j in range(n_land))
        site["timing_robustness_fraction"] = r(n_full / n_land, 4)


def build_landing_windows(rid, site, row, horizons):
    n_land = int((SEARCH_END - SEARCH_START).total_seconds() // STEP_S)
    n_samp = n_land + STAY_SAMPLES - 1
    worst, bad = [], []
    for j in range(n_samp):
        t = SEARCH_START + timedelta(seconds=j * STEP_S)
        sa, se = sun_az_el(t)
        ea, ee = earth_az_el(t)
        c = min(se - horizon_at(horizons, row, sa), ee - horizon_at(horizons, row, ea))
        worst.append(c)
        bad.append(0 if c > 0 else 1)
    prefix = [0]
    for b in bad:
        prefix.append(prefix[-1] + b)
    full = [prefix[j + STAY_SAMPLES] - prefix[j] == 0 for j in range(n_land)]
    # Sliding minimum of worst-case clearance over each stay.
    stay_min, dq = [0.0] * n_land, deque()
    for k in range(n_samp):
        while dq and worst[dq[-1]] >= worst[k]:
            dq.pop()
        dq.append(k)
        j = k - STAY_SAMPLES + 1
        if j >= 0:
            while dq[0] < j:
                dq.popleft()
            if j < n_land:
                stay_min[j] = worst[dq[0]]

    def t_at(j):
        return SEARCH_START + timedelta(seconds=j * STEP_S)

    runs, j = [], 0
    while j < n_land:
        k = j
        while k < n_land and full[k] == full[j]:
            k += 1
        runs.append((j, k, full[j]))  # [j, k) landing-time indices
        j = k

    windows = []
    for a, b, is_full in runs:
        if not is_full:
            continue
        if windows and (a - windows[-1]["b"]) * STEP_S / 3600 < MERGE_GAP_H:
            windows[-1]["b"] = b
            windows[-1]["gaps"] = True
        else:
            windows.append({"a": a, "b": b, "gaps": False})
    out = []
    for w in windows:
        best = max((jj for jj in range(w["a"], w["b"]) if full[jj]), key=lambda jj: stay_min[jj])
        out.append({"rank": 0, "start_utc": utc(t_at(w["a"])), "end_utc": utc(t_at(w["b"])),
                    "duration_h": r((w["b"] - w["a"]) * STEP_S / 3600, 2),
                    "contains_partial_gaps": w["gaps"], "best_landing_time_utc": utc(t_at(best)),
                    "best_worst_case_min_clearance_deg": r(stay_min[best])})
    out.sort(key=lambda w: -w["best_worst_case_min_clearance_deg"])
    out = out[:TOP_N]
    for n, w in enumerate(out, start=1):
        w["rank"] = n
    return {
        "schema_version": SCHEMA_VERSION, "mock": True, "region_id": rid, "site_id": site["site_id"],
        "search_start_utc": utc(SEARCH_START), "search_end_utc": utc(SEARCH_END), "step_s": STEP_S,
        "merge_gap_h": MERGE_GAP_H, "top_n": TOP_N,
        "strip": {"runs": [{"start_utc": utc(t_at(a)), "end_utc": utc(t_at(b)),
                            "coverage": "full" if f else "partial"} for a, b, f in runs]},
        "windows": out,
    }


def build_ephemeris(cx: float, cy: float) -> None:
    lat, lon = xy_to_ll(cx, cy)
    p, l = math.radians(lat), math.radians(lon)
    up = (math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p))
    east = (-math.sin(l), math.cos(l), 0.0)
    north = (-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p))
    site = tuple(R_M / 1000 * u for u in up)
    start = datetime(EPHEMERIS_YEAR, 1, 1, tzinfo=timezone.utc)
    n = int((datetime(EPHEMERIS_YEAR + 1, 1, 1, tzinfo=timezone.utc) - start).total_seconds() // STEP_S)
    data = array.array("f")
    for j in range(n):
        t = start + timedelta(seconds=j * STEP_S)
        for (az, el), dist in ((sun_az_el(t), 1.496e8), (earth_az_el(t), 384_400.0)):
            a, e = math.radians(az), math.radians(el)
            d = [math.cos(e) * math.sin(a) * east[k] + math.cos(e) * math.cos(a) * north[k] + math.sin(e) * up[k]
                 for k in range(3)]
            data.extend(site[k] + dist * d[k] for k in range(3))
    name = f"positions-{EPHEMERIS_YEAR}"
    write_bin(OUT / "ephemeris" / f"{name}.bin", data)
    write_json(OUT / "ephemeris" / f"{name}.json", {
        "schema_version": SCHEMA_VERSION, "mock": True, "file": f"{name}.bin", "dtype": "float32",
        "byte_order": "little", "shape": [n, 2, 3], "axes": ["time", "body", "xyz"], "units": "km", "scale": 1,
        "bodies": ["sun", "earth"], "frame": "MOON_ME", "aberration_correction": "LT+S",
        "start_utc": utc(start), "step_s": STEP_S,
    })


def main() -> None:
    print("regions + outlines + base maps ...")
    reg = build_regions()
    write_json(OUT / "regions.json", reg)
    home_rho = 2 * R_M * math.tan(math.radians(5))  # 80 deg S
    home_ext = [r(-home_rho, 1), r(-home_rho, 1), r(home_rho, 1), r(home_rho, 1)]
    write_basemap(OUT / "home", home_ext, 512,
                  lambda x, y: 3000 * math.sin(x / 23_000) * math.cos(y / 31_000) + 1500 * math.sin((x + y) / 9_000))
    for reg_entry in reg["regions"]:
        rid = reg_entry["id"]
        cx, cy = reg_entry["center"]["x_m"], reg_entry["center"]["y_m"]
        ext = region_extent(cx, cy)
        write_outline(rid, ext)
        if rid == DEMO_REGION:
            fn = (lambda cx_, cy_: (lambda x, y: terrain_height(x, y, cx_, cy_)))(cx, cy)
        else:
            fn = lambda x, y: 800 * math.sin(x / 1_700) * math.cos(y / 2_300) + 300 * math.sin((x - y) / 600)
        write_basemap(OUT / "regions" / rid, ext, 750 if rid == DEMO_REGION else 300, fn)

    demo = next(e for e in reg["regions"] if e["id"] == DEMO_REGION)
    cx, cy = demo["center"]["x_m"], demo["center"]["y_m"]
    folder = OUT / "regions" / DEMO_REGION

    print("sites ...")
    sites = build_sites(cx, cy)

    print("horizons ...")
    horizons = build_horizons(sites, cx, cy)
    print("timing robustness ...")
    add_timing_robustness(sites, horizons)
    write_json(folder / "sites.json", {
        "schema_version": SCHEMA_VERSION, "mock": True, "region_id": DEMO_REGION,
        "grid_spacing_m": GRID_SPACING_M, "site_radius_m": SITE_RADIUS_M,
        "observer_height_m": OBSERVER_HEIGHT_M, "sites": sites})
    write_packed_horizons(folder / "horizons.bin.gz", horizons, N_AZ)
    write_json(folder / "horizons.json", {
        "schema_version": SCHEMA_VERSION, "mock": True, "file": "horizons.bin.gz", "dtype": "int16",
        "byte_order": "little", "shape": [len(sites), N_AZ], "axes": ["site", "azimuth"], "units": "deg",
        "scale": 0.01, "azimuth_start_deg": 0, "azimuth_step_deg": AZ_STEP_DEG,
        "observer_height_m": OBSERVER_HEIGHT_M, "region_id": DEMO_REGION,
        "compression": "gzip", "delta_axis": "azimuth"})

    print("ephemeris ...")
    build_ephemeris(cx, cy)

    print("ranking ...")
    times = [LANDING_TIME + timedelta(seconds=k * STEP_S) for k in range(STAY_SAMPLES)]
    sun = [sun_az_el(t) for t in times]
    earth = [earth_az_el(t) for t in times]
    entries, top_rows = build_ranking(sites, horizons, times, sun, earth)
    by_row = {e["_i"]: e for e in entries}
    for e in entries:
        del e["_i"]
    write_json(folder / "results" / "ranking" / f"{compact(LANDING_TIME)}.json", {
        "schema_version": SCHEMA_VERSION, "mock": True, "region_id": DEMO_REGION,
        "landing_time_utc": utc(LANDING_TIME), "stay_end_utc": utc(times[-1]), "step_s": STEP_S,
        "n_samples": STAY_SAMPLES, "observer_height_m": OBSERVER_HEIGHT_M, "top_n": TOP_N,
        "top_separation_m": TOP_SEPARATION_M, "sites": entries})

    print("site details + landing windows for the top sites ...")
    for row in top_rows:
        site = sites[row]
        detail = build_site_detail(DEMO_REGION, site, row, horizons, times, sun, earth, by_row[row])
        write_json(folder / "results" / "site-detail" / compact(LANDING_TIME) / f"{site['site_id']}.json", detail)
        write_json(folder / "results" / "landing-windows" / f"{site['site_id']}.json",
                   build_landing_windows(DEMO_REGION, site, row, horizons))

    n_full = sum(1 for e in entries if e["coverage"] == "full")
    print(f"done: {len(sites)} sites, {n_full} full coverage, top sites: "
          + ", ".join(sites[i]["site_id"] for i in top_rows))


if __name__ == "__main__":
    main()
