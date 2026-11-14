"""Cross-checks on the committed Mons Mouton site data (data/processed/site-data)."""

from datetime import timedelta
from pathlib import Path

import pytest

from pipeline.clearance import parse_utc
from pipeline.results import landing_windows_for, load_region, ranking_for, span_positions, stay_positions

pytestmark = pytest.mark.slow
DATA = Path(__file__).resolve().parents[1] / "data" / "processed" / "site-data"


@pytest.fixture(scope="module")
def region():
    if not (DATA / "regions" / "mons-mouton" / "horizons.bin.gz").exists():
        pytest.skip("Mons Mouton site data not built")
    return load_region(DATA, "mons-mouton")


def test_a_windows_best_landing_time_ranks_as_full_coverage_with_the_same_clearance(region):
    # Two independent paths: the year-long sliding minimum (Landing Windows) and the
    # one-stay ranking over all sites must agree on the same site and Landing Time.
    i = 1000
    lw = landing_windows_for(region, span_positions(DATA / "ephemeris"), i)
    assert lw["windows"], "expected at least one Landing Window for this site"
    w = lw["windows"][0]
    t = parse_utc(w["best_landing_time_utc"])
    doc, _ = ranking_for(region, stay_positions(DATA / "ephemeris", t), t)
    entry = next(e for e in doc["sites"] if e["site_id"] == region.site_ids[i])
    assert entry["coverage"] == "full"
    assert entry["worst_case_min_clearance_deg"] == pytest.approx(w["best_worst_case_min_clearance_deg"], abs=0.002)
    # The Landing Time just before a window starts is Partial (unless the window opens the span).
    start = parse_utc(w["start_utc"])
    if start > parse_utc(lw["search_start_utc"]):
        before = start - timedelta(minutes=10)
        doc, _ = ranking_for(region, stay_positions(DATA / "ephemeris", before), before)
        entry = next(e for e in doc["sites"] if e["site_id"] == region.site_ids[i])
        assert entry["coverage"] == "partial"
