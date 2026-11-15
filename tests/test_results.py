"""The results/ documents, written from the tiny synthetic data folder in conftest.py."""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from pipeline.results import build_results

SCHEMAS = Path(__file__).resolve().parents[1] / "contract" / "schemas"
LANDING = datetime(2027, 3, 1, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def data(site_data: Path) -> Path:
    build_results(site_data, "demo", [LANDING])
    return site_data / "regions" / "demo" / "results"


def _check(schema: str, doc: dict) -> None:
    v = Draft202012Validator(json.loads((SCHEMAS / f"{schema}.schema.json").read_text()))
    errors = [e.message for e in v.iter_errors(doc)]
    assert errors == []


def test_ranking_document_follows_the_contract_and_the_design_order(data):
    doc = json.loads((data / "ranking" / "20270301T0000Z.json").read_text())
    _check("ranking", doc)
    assert doc["landing_time_utc"] == "2027-03-01T00:00:00Z"
    assert doc["stay_end_utc"] == "2027-03-08T00:00:00Z"
    assert doc["n_samples"] == 1009 and doc["step_s"] == 600 and doc["mock"] is False
    assert [s["site_id"] for s in doc["sites"]] == ["r000c000", "r000c002", "r000c001"]
    best, second, blocked = doc["sites"]
    assert best["coverage"] == "full" and best["worst_case_min_clearance_deg"] == pytest.approx(4.742, abs=0.002)
    assert best["sun"]["min_elevation_deg"] == pytest.approx(5.0, abs=0.002)
    assert second["worst_case_min_clearance_deg"] == pytest.approx(3.742, abs=0.002)
    assert blocked["coverage"] == "partial"
    assert blocked["sun"]["los_fraction"] == 0 and blocked["sun"]["first_los_loss_utc"] == "2027-03-01T00:00:00Z"
    assert best["sun"]["first_los_loss_utc"] is None
    assert best["sun"]["los_duration_h"] == pytest.approx(1009 * 600 / 3600, abs=0.01)
    # 3 km apart, so all three make the top list.
    assert [s["top"] for s in doc["sites"]] == [True, True, True]


def test_site_detail_is_written_for_each_top_site(data):
    files = sorted((data / "site-detail" / "20270301T0000Z").glob("*.json"))
    assert [f.stem for f in files] == ["r000c000", "r000c001", "r000c002"]
    doc = json.loads(files[2].read_text())
    _check("site-detail", doc)
    assert doc["horizon"]["elevation_deg"][:2] == [1.0, 1.0]
    assert doc["series"]["time_utc"][1] == "2027-03-01T00:10:00Z"
    assert len(doc["series"]["earth"]["horizon_elevation_deg"]) == 1009
    assert doc["series"]["sun"]["elevation_deg"][0] == pytest.approx(5.0, abs=0.002)


def test_landing_windows_cover_the_supported_span(data):
    full = json.loads((data / "landing-windows" / "r000c000.json").read_text())
    _check("landing-windows", full)
    assert full["search_start_utc"] == "2026-11-14T00:00:00Z"
    assert full["search_end_utc"] == "2027-11-14T00:00:00Z"
    assert full["strip"]["runs"] == [{"start_utc": "2026-11-14T00:00:00Z", "end_utc": "2027-11-14T00:00:00Z",
                                      "coverage": "full"}]
    [w] = full["windows"]
    assert w["duration_h"] == 365 * 24 and w["best_landing_time_utc"] == "2026-11-14T00:00:00Z"
    blocked = json.loads((data / "landing-windows" / "r000c001.json").read_text())
    assert blocked["windows"] == []


def test_landing_times_outside_the_supported_span_or_off_the_grid_are_refused(data):
    root = data.parents[2]
    with pytest.raises(ValueError, match="Supported Span"):
        build_results(root, "demo", [datetime(2027, 11, 14, tzinfo=timezone.utc)])
    with pytest.raises(ValueError, match="10-minute"):
        build_results(root, "demo", [datetime(2027, 3, 1, 0, 5, tzinfo=timezone.utc)])
