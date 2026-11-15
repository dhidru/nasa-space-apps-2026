"""Timing Robustness of every Landing Site, written into its region's sites.json.

Timing Robustness is the share of Landing Times in the Supported Span whose
Surface Stay has Full Coverage (GLOSSARY.md, data-contract §5.3). It doesn't
depend on the chosen Landing Time, so it is computed once here rather than in
the browser. Run it after pipeline.build and pipeline.ephemeris, because
pipeline.build rewrites sites.json without it.

    python -m pipeline.robustness [DATA_DIR] [--region ID ...]   # default: every region with sites.json
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from .results import BODIES, N_SAMPLES, REPO, Region, load_region, span_positions
from .scoring import timing_robustness_fraction

ROBUSTNESS_CHUNK = 16  # sites per batch: each [16, 53,568] float64 array is ~7 MB


def timing_robustness(region: Region, span: dict[str, np.ndarray]) -> np.ndarray:
    """Timing Robustness per site, in sites.json order; `span` is span_positions(...)."""
    n = len(region.site_ids)
    out = np.empty(n)
    for a in range(0, n, ROBUSTNESS_CHUNK):
        idx = np.arange(a, min(a + ROBUSTNESS_CHUNK, n))
        worst = np.minimum(*(region.track(idx, span[b]).clearance_deg for b in BODIES))
        out[idx] = timing_robustness_fraction(worst, stay_samples=N_SAMPLES)
    return out


def stored_fraction(f: float) -> float:
    """Rounded to 4 decimals for sites.json, but a site with any Full Coverage Landing Time never
    rounds to 0, and one with any Partial Landing Time never rounds to 1."""
    return min(max(round(float(f), 4), 0.0001 if f > 0 else 0.0), 0.9999 if f < 1 else 1.0)


def write_timing_robustness(data_dir: Path, region_id: str, span: dict[str, np.ndarray] | None = None) -> np.ndarray:
    """Add `timing_robustness_fraction` to every site of the region's sites.json."""
    data_dir = Path(data_dir)
    region = load_region(data_dir, region_id)
    span = span if span is not None else span_positions(data_dir / "ephemeris")
    fractions = timing_robustness(region, span)
    path = data_dir / "regions" / region_id / "sites.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    for site, f in zip(doc["sites"], fractions):
        site["timing_robustness_fraction"] = stored_fraction(f)
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    return fractions


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("data_dir", nargs="?", type=Path, default=REPO / "data" / "processed" / "site-data")
    p.add_argument("--region", action="append", dest="regions", help="repeatable (default: every region with sites)")
    a = p.parse_args(argv)
    regions = a.regions or sorted(f.parent.name for f in (a.data_dir / "regions").glob("*/sites.json"))
    span = span_positions(a.data_dir / "ephemeris")
    for rid in regions:
        t0 = time.time()
        f = write_timing_robustness(a.data_dir, rid, span)
        print(f"{rid}: {f.size} sites in {time.time() - t0:.0f} s, median {np.median(f):.1%}, max {f.max():.1%}")


if __name__ == "__main__":
    main()
