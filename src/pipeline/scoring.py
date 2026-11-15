"""Metrics, ranking and Landing Windows (design.md §5-6, data-contract §7).

Everything here works on arrays in index space (sites, samples, Landing Time
steps). pipeline.results turns the outputs into the contract's JSON documents.
Line of Sight means Clearance > 0, judged at the body's center (GLOSSARY.md).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def body_stats(elevation_deg: np.ndarray, clearance_deg: np.ndarray, *, step_s: int) -> dict[str, np.ndarray]:
    """Per-body stats of data-contract §7 for each site, from [n_sites, n_samples] arrays.

    `first_los_loss_index` is the first sample without Line of Sight, or -1 if there is none.
    """
    el = np.asarray(elevation_deg, float)
    clr = np.asarray(clearance_deg, float)
    los = clr > 0.0
    n_los = los.sum(axis=1)
    lost = ~los
    return {
        "min_elevation_deg": el.min(axis=1),
        "mean_elevation_deg": el.mean(axis=1),
        "max_elevation_deg": el.max(axis=1),
        "min_clearance_deg": clr.min(axis=1),
        "mean_clearance_deg": clr.mean(axis=1),
        "max_clearance_deg": clr.max(axis=1),
        "los_fraction": n_los / clr.shape[1],
        "los_duration_h": n_los * step_s / 3600.0,
        "first_los_loss_index": np.where(lost.any(axis=1), lost.argmax(axis=1), -1),
    }


@dataclass(frozen=True)
class Ranking:
    order: np.ndarray                         # site indices, best first
    full: np.ndarray                          # bool per site: Full Coverage
    worst_case_min_clearance_deg: np.ndarray  # per site: min(Sun min, Earth min Clearance)


def rank_sites(sun: dict[str, np.ndarray], earth: dict[str, np.ndarray]) -> Ranking:
    """Rank sites by design.md §6 / data-contract §7.1.

    Full Coverage first, by worst-case min Clearance then by the mean of the two mean
    Clearances; then Partial Coverage, by the weaker body's fraction in Line of Sight.
    Remaining ties keep site (sites.json) order.
    """
    full = (sun["los_fraction"] == 1.0) & (earth["los_fraction"] == 1.0)
    worst = np.minimum(sun["min_clearance_deg"], earth["min_clearance_deg"])
    mean = (sun["mean_clearance_deg"] + earth["mean_clearance_deg"]) / 2.0
    weaker = np.minimum(sun["los_fraction"], earth["los_fraction"])
    key1 = np.where(full, -worst, -weaker)
    key2 = np.where(full, -mean, 0.0)
    order = np.lexsort((np.arange(full.size), key2, key1, ~full))  # last key sorts first
    return Ranking(order=order, full=full, worst_case_min_clearance_deg=worst)


def select_top(order: np.ndarray, x_m: np.ndarray, y_m: np.ndarray, *, n: int, separation_m: float) -> list[int]:
    """Greedy top-n (design.md §6): walk the ranking, keep a site unless it lies closer than
    separation_m (map distance, data-contract §5.4) to a site already kept."""
    chosen: list[int] = []
    for i in order:
        if len(chosen) == n:
            break
        if all(np.hypot(x_m[i] - x_m[j], y_m[i] - y_m[j]) >= separation_m for j in chosen):
            chosen.append(int(i))
    return chosen


@dataclass(frozen=True)
class Window:
    start: int   # first Landing Time index
    end: int     # exclusive
    contains_partial_gaps: bool
    best: int    # Landing Time index with the highest worst-case min Clearance
    best_worst_case_min_clearance_deg: float


@dataclass(frozen=True)
class LandingWindows:
    runs: list[tuple[int, int, bool]]  # [start, end) Landing Time indices, Full Coverage or not
    windows: list[Window]              # best first


def landing_windows(worst_clearance_deg: np.ndarray, *, stay_samples: int, merge_gap_steps: int,
                    top_n: int) -> LandingWindows:
    """Landing Windows for one site (design.md §6, data-contract §7.3).

    worst_clearance_deg[k] is min(Sun, Earth Clearance) at sample k, where sample k is the
    k-th step from the first Landing Time searched; it has n_landing + stay_samples - 1
    entries. Landing Time j has Full Coverage when every sample of its stay
    [j, j + stay_samples) has Clearance > 0. Full runs whose gap (start of the next minus
    end of the previous) is less than merge_gap_steps are merged. Windows are ranked by
    the best worst-case min Clearance among their Full Coverage Landing Times.
    """
    worst = np.asarray(worst_clearance_deg, float)
    stay_min = np.lib.stride_tricks.sliding_window_view(worst, stay_samples).min(axis=1)
    full = stay_min > 0.0
    n = full.size
    edges = np.flatnonzero(np.diff(full)) + 1
    starts = np.concatenate([[0], edges])
    ends = np.concatenate([edges, [n]])
    runs = [(int(a), int(b), bool(full[a])) for a, b in zip(starts, ends)]

    merged: list[list] = []  # [start, end, contains_partial_gaps]
    for a, b, is_full in runs:
        if not is_full:
            continue
        if merged and a - merged[-1][1] < merge_gap_steps:
            merged[-1][1], merged[-1][2] = b, True
        else:
            merged.append([a, b, False])
    windows = []
    for a, b, gaps in merged:
        scores = np.where(full[a:b], stay_min[a:b], -np.inf)
        best = a + int(np.argmax(scores))
        windows.append(Window(a, b, gaps, best, float(stay_min[best])))
    windows.sort(key=lambda w: -w.best_worst_case_min_clearance_deg)
    return LandingWindows(runs=runs, windows=windows[:top_n])


def timing_robustness_fraction(worst_clearance_deg: np.ndarray, *, stay_samples: int) -> np.ndarray:
    """Timing Robustness of each site: the share of Landing Times whose stay has Full Coverage.

    worst_clearance_deg is [n_sites, n_landing + stay_samples - 1], laid out as in
    landing_windows. Landing Time j has Full Coverage when no sample of [j, j + stay_samples)
    lacks Clearance > 0; a running count of blocked samples finds that in O(n) per site.
    """
    blocked = ~(np.atleast_2d(np.asarray(worst_clearance_deg, float)) > 0.0)  # as landing_windows: NaN is blocked
    count = np.concatenate([np.zeros((blocked.shape[0], 1), np.int64), np.cumsum(blocked, axis=1)], axis=1)
    in_stay = count[:, stay_samples:] - count[:, :-stay_samples]
    return (in_stay == 0).mean(axis=1)
