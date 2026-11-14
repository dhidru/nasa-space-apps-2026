"""Write the results/ documents of data-contract §7 from the built site data.

Reads a region's sites.json and horizons.bin.gz and the ephemeris/ positions,
then for each Landing Time writes:
- results/ranking/<landing-time>.json: every site, ranked (§7.1)
- results/site-detail/<landing-time>/<site-id>.json: one per top site (§7.2)
- results/landing-windows/<site-id>.json: one per top site, over the Supported Span (§7.3)

    python -m pipeline.results [DATA_DIR] [--region ID] [--landing-time 2027-03-01T00:00:00Z ...]
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .clearance import STEP_S, horizon_elevation_at, load_positions, local_az_el, parse_utc, utc
from .horizon import decode_horizons
from .scoring import body_stats, landing_windows, rank_sites, select_top

SCHEMA_VERSION = 1
STAY_STEPS = 7 * 24 * 3600 // STEP_S   # 1,008 steps; both ends are sampled
N_SAMPLES = STAY_STEPS + 1
SPAN_START = datetime(2026, 11, 14, tzinfo=timezone.utc)  # Supported Span, data-contract §2
SPAN_END = datetime(2027, 11, 14, tzinfo=timezone.utc)    # exclusive
TOP_N = 10
TOP_SEPARATION_M = 2000.0
MERGE_GAP_H = 24
SITE_CHUNK = 512  # sites per batch, to bound memory (each [chunk, 1009] float64 array is ~4 MB)
BODIES = ("sun", "earth")

REPO = Path(__file__).resolve().parents[2]


def landing_time_file_name(t: datetime) -> str:
    """The compact form used in results/ file names (data-contract §4): 20270301T0000Z."""
    return t.strftime("%Y%m%dT%H%MZ")


def _round(v: float, nd: int = 3) -> float:
    return round(float(v), nd)


def check_landing_time(t: datetime) -> None:
    if not SPAN_START <= t < SPAN_END:
        raise ValueError(f"Landing Time {utc(t)} is outside the Supported Span [{utc(SPAN_START)}, {utc(SPAN_END)})")
    if (t - SPAN_START).total_seconds() % STEP_S:
        raise ValueError(f"Landing Time {utc(t)} is not on the 10-minute UTC grid")


@dataclass
class BodyTrack:
    """One body over a time range for some sites: [n_sites, n_times] arrays."""
    azimuth_deg: np.ndarray
    elevation_deg: np.ndarray
    horizon_elevation_deg: np.ndarray  # the terrain line under the body

    @property
    def clearance_deg(self) -> np.ndarray:
        return self.elevation_deg - self.horizon_elevation_deg


@dataclass
class Region:
    """A region's site grid and Horizons; site arrays follow the order of sites.json."""
    region_id: str
    site_ids: list[str]
    x_m: np.ndarray
    y_m: np.ndarray
    lat_deg: np.ndarray
    lon_deg: np.ndarray
    observer_above_sphere_m: np.ndarray  # terrain height + Observer Height
    observer_height_m: float
    horizons_deg: np.ndarray  # [n_sites, 1440]
    azimuth_step_deg: float

    def track(self, idx: np.ndarray, body_km: np.ndarray) -> BodyTrack:
        """Where a body at body_km [n_times, 3] appears from sites idx, and the terrain under it."""
        az, el = local_az_el(self.lat_deg[idx], self.lon_deg[idx], self.observer_above_sphere_m[idx], body_km)
        return BodyTrack(az, el, horizon_elevation_at(self.horizons_deg[idx], az))


def load_region(data_dir: Path, region_id: str) -> Region:
    folder = Path(data_dir) / "regions" / region_id
    sites_doc = json.loads((folder / "sites.json").read_text(encoding="utf-8"))
    sites = sites_doc["sites"]
    meta = json.loads((folder / "horizons.json").read_text(encoding="utf-8"))
    q = decode_horizons((folder / meta["file"]).read_bytes(), meta["shape"])
    if q.shape[0] != len(sites):
        raise ValueError(f"{region_id}: {q.shape[0]} Horizon rows but {len(sites)} sites")
    if meta["azimuth_start_deg"] != 0 or meta["azimuth_step_deg"] * q.shape[1] != 360:
        raise ValueError(f"{region_id}: Horizon azimuths do not cover 0-360 from 0")

    def column(field: str) -> np.ndarray:
        return np.array([s[field] for s in sites], float)

    observer_height_m = float(sites_doc["observer_height_m"])
    return Region(region_id, [s["site_id"] for s in sites], column("x_m"), column("y_m"), column("lat_deg"),
                  column("lon_deg"), column("terrain_height_m") + observer_height_m, observer_height_m,
                  q * float(meta["scale"]), float(meta["azimuth_step_deg"]))


def stay_positions(ephemeris_dir: Path, landing: datetime) -> dict[str, np.ndarray]:
    """Sun and Earth vectors over the Surface Stay that starts at `landing`."""
    check_landing_time(landing)
    return dict(zip(BODIES, load_positions(ephemeris_dir, landing, N_SAMPLES)))


def span_positions(ephemeris_dir: Path) -> dict[str, np.ndarray]:
    """Sun and Earth vectors for every stay of the Supported Span (n_landing + 1,008 samples)."""
    n_land = int((SPAN_END - SPAN_START).total_seconds()) // STEP_S
    return dict(zip(BODIES, load_positions(ephemeris_dir, SPAN_START, n_land + STAY_STEPS)))


def _coverage(full: bool) -> str:
    return "full" if full else "partial"


def _stay_times(landing: datetime) -> list[datetime]:
    return [landing + timedelta(seconds=STEP_S * k) for k in range(N_SAMPLES)]


def _stats_doc(stats: dict[str, np.ndarray], i: int, times: list[datetime]) -> dict:
    k = int(stats["first_los_loss_index"][i])
    return {
        **{f: _round(stats[f][i]) for f in ("min_elevation_deg", "mean_elevation_deg", "max_elevation_deg",
                                            "min_clearance_deg", "mean_clearance_deg", "max_clearance_deg")},
        "los_fraction": _round(stats["los_fraction"][i], 4),
        "los_duration_h": _round(stats["los_duration_h"][i], 2),
        "first_los_loss_utc": None if k < 0 else utc(times[k]),
    }


def _stay_header(region: Region, landing: datetime) -> dict:
    return {"schema_version": SCHEMA_VERSION, "mock": False, "region_id": region.region_id,
            "landing_time_utc": utc(landing), "stay_end_utc": utc(landing + timedelta(seconds=STAY_STEPS * STEP_S)),
            "step_s": STEP_S, "n_samples": N_SAMPLES}


def ranking_for(region: Region, positions: dict[str, np.ndarray], landing: datetime) -> tuple[dict, list[int]]:
    """The ranking document (§7.1) and the indices of the top sites, best first.

    `positions` is stay_positions(..., landing).
    """
    n = len(region.site_ids)
    parts: dict[str, list[dict]] = {b: [] for b in BODIES}
    for a in range(0, n, SITE_CHUNK):
        idx = np.arange(a, min(a + SITE_CHUNK, n))
        for b in BODIES:
            t = region.track(idx, positions[b])
            parts[b].append(body_stats(t.elevation_deg, t.clearance_deg, step_s=STEP_S))
    stats = {b: {f: np.concatenate([p[f] for p in parts[b]]) for f in parts[b][0]} for b in BODIES}
    ranking = rank_sites(stats["sun"], stats["earth"])
    top = select_top(ranking.order, region.x_m, region.y_m, n=TOP_N, separation_m=TOP_SEPARATION_M)
    top_set = set(top)
    times = _stay_times(landing)
    entries = [{
        "site_id": region.site_ids[i], "rank": rank,
        "coverage": _coverage(ranking.full[i]),
        "worst_case_min_clearance_deg": _round(ranking.worst_case_min_clearance_deg[i]),
        "top": int(i) in top_set,
        **{b: _stats_doc(stats[b], int(i), times) for b in BODIES},
    } for rank, i in enumerate(ranking.order, start=1)]
    doc = {**_stay_header(region, landing), "observer_height_m": region.observer_height_m,
           "top_n": TOP_N, "top_separation_m": TOP_SEPARATION_M, "sites": entries}
    return doc, top


def site_detail_for(region: Region, positions: dict[str, np.ndarray], landing: datetime, i: int,
                    ranking_entry: dict) -> dict:
    """The site detail document (§7.2); ranking_entry is this site's entry in the ranking."""
    idx = np.array([i])
    series = {}
    for b in BODIES:
        t = region.track(idx, positions[b])
        series[b] = {"azimuth_deg": [_round(v) for v in t.azimuth_deg[0]],
                     "elevation_deg": [_round(v) for v in t.elevation_deg[0]],
                     "horizon_elevation_deg": [_round(v) for v in t.horizon_elevation_deg[0]]}
    return {
        **_stay_header(region, landing), "site_id": region.site_ids[i],
        "coverage": ranking_entry["coverage"],
        "worst_case_min_clearance_deg": ranking_entry["worst_case_min_clearance_deg"],
        "horizon": {"azimuth_start_deg": 0, "azimuth_step_deg": region.azimuth_step_deg,
                    "elevation_deg": [_round(v, 2) for v in region.horizons_deg[i]]},
        "series": {"time_utc": [utc(t) for t in _stay_times(landing)], **series},
        "stats": {b: ranking_entry[b] for b in BODIES},
    }


def landing_windows_for(region: Region, positions: dict[str, np.ndarray], i: int) -> dict:
    """The Landing Windows document (§7.3); `positions` is span_positions(...)."""
    idx = np.array([i])
    worst = np.minimum(*(region.track(idx, positions[b]).clearance_deg[0] for b in BODIES))
    found = landing_windows(worst, stay_samples=N_SAMPLES, merge_gap_steps=round(MERGE_GAP_H * 3600 / STEP_S),
                            top_n=TOP_N)

    def landing_utc(j: int) -> str:
        return utc(SPAN_START + timedelta(seconds=STEP_S * j))

    return {
        "schema_version": SCHEMA_VERSION, "mock": False, "region_id": region.region_id,
        "site_id": region.site_ids[i], "search_start_utc": utc(SPAN_START), "search_end_utc": utc(SPAN_END),
        "step_s": STEP_S, "merge_gap_h": MERGE_GAP_H, "top_n": TOP_N,
        "strip": {"runs": [{"start_utc": landing_utc(a), "end_utc": landing_utc(b), "coverage": _coverage(f)}
                           for a, b, f in found.runs]},
        "windows": [{"rank": r, "start_utc": landing_utc(w.start), "end_utc": landing_utc(w.end),
                     "duration_h": _round((w.end - w.start) * STEP_S / 3600, 2),
                     "contains_partial_gaps": w.contains_partial_gaps,
                     "best_landing_time_utc": landing_utc(w.best),
                     "best_worst_case_min_clearance_deg": _round(w.best_worst_case_min_clearance_deg)}
                    for r, w in enumerate(found.windows, start=1)],
    }


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def build_results(data_dir: Path, region_id: str, landing_times: list[datetime]) -> list[Path]:
    """Write the ranking, top-site details and top-site Landing Windows for each Landing Time."""
    for t in landing_times:
        check_landing_time(t)
    data_dir = Path(data_dir)
    region = load_region(data_dir, region_id)
    ephemeris_dir = data_dir / "ephemeris"
    out = data_dir / "regions" / region_id / "results"
    written: list[Path] = []
    span: dict[str, np.ndarray] | None = None
    windows_done: set[int] = set()
    for t in landing_times:
        stay = stay_positions(ephemeris_dir, t)
        doc, top = ranking_for(region, stay, t)
        entries = {e["site_id"]: e for e in doc["sites"]}
        written.append(out / "ranking" / f"{landing_time_file_name(t)}.json")
        _write_json(written[-1], doc)
        for i in top:
            sid = region.site_ids[i]
            written.append(out / "site-detail" / landing_time_file_name(t) / f"{sid}.json")
            _write_json(written[-1], site_detail_for(region, stay, t, i, entries[sid]))
            if i not in windows_done:  # Landing Windows don't depend on the Landing Time
                windows_done.add(i)
                span = span if span is not None else span_positions(ephemeris_dir)
                written.append(out / "landing-windows" / f"{sid}.json")
                _write_json(written[-1], landing_windows_for(region, span, i))
    return written


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("data_dir", nargs="?", type=Path, default=REPO / "data" / "processed" / "site-data")
    p.add_argument("--region", default="mons-mouton")
    p.add_argument("--landing-time", action="append", type=parse_utc, dest="landing_times",
                   help="UTC, e.g. 2027-03-01T00:00:00Z; repeatable (default: 2027-03-01T00:00:00Z)")
    a = p.parse_args(argv)
    times = a.landing_times or [datetime(2027, 3, 1, tzinfo=timezone.utc)]
    for path in build_results(a.data_dir, a.region, times):
        print(path)


if __name__ == "__main__":
    main()
