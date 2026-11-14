"""The results/ documents, written from a tiny synthetic data folder.

Three sites at 85 S, 0 E with flat Horizons of 0, 10 and 1 deg. The Sun and
Earth hold still along +x (MOON_ME), so from 85 S the Sun stands at 5.0 deg
and Earth at 4.742 deg (parallax, see test_clearance) all year, both due north.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest
from jsonschema import Draft202012Validator

from pipeline.horizon import encode_horizons, quantize_horizons
from pipeline.results import build_results

SCHEMAS = Path(__file__).resolve().parents[1] / "contract" / "schemas"
LANDING = datetime(2027, 3, 1, tzinfo=timezone.utc)


def _positions(folder: Path, year: int) -> None:
    n = int((datetime(year + 1, 1, 1) - datetime(year, 1, 1)).total_seconds()) // 600
    arr = np.zeros((n, 2, 3), "<f4")
    arr[:, 0, 0] = 1.5e8
    arr[:, 1, 0] = 384_400.0
    arr.tofile(folder / f"positions-{year}.bin")
    (folder / f"positions-{year}.json").write_text(json.dumps({
        "schema_version": 1, "mock": True, "file": f"positions-{year}.bin", "dtype": "float32",
        "byte_order": "little", "shape": [n, 2, 3], "axes": ["time", "body", "xyz"], "units": "km",
        "scale": 1, "bodies": ["sun", "earth"], "frame": "MOON_ME", "aberration_correction": "LT+S",
        "start_utc": f"{year}-01-01T00:00:00Z", "step_s": 600}))


@pytest.fixture(scope="module")
def data(tmp_path_factory) -> Path:
    root = tmp_path_factory.mktemp("site-data")
    (root / "ephemeris").mkdir()
    for y in (2026, 2027):
        _positions(root / "ephemeris", y)
    region = root / "regions" / "demo"
    region.mkdir(parents=True)
    # Sites 3 km apart along x, all at (85 S, 0 E) as far as the sky is concerned.
    sites = [{"site_id": f"r000c00{i}", "x_m": 3000.0 * i, "y_m": 0.0, "lat_deg": -85.0, "lon_deg": 0.0,
              "terrain_height_m": -2.0} for i in range(3)]  # -2 m + 2 m Observer Height = the sphere
    (region / "sites.json").write_text(json.dumps({
        "schema_version": 1, "mock": True, "region_id": "demo", "grid_spacing_m": 200,
        "site_radius_m": 100, "observer_height_m": 2, "sites": sites}))
    hz = np.array([np.full(1440, 0.0), np.full(1440, 10.0), np.full(1440, 1.0)])
    q = quantize_horizons(hz)
    (region / "horizons.bin.gz").write_bytes(encode_horizons(q))
    (region / "horizons.json").write_text(json.dumps({
        "schema_version": 1, "mock": True, "file": "horizons.bin.gz", "dtype": "int16",
        "byte_order": "little", "shape": [3, 1440], "axes": ["site", "azimuth"], "units": "deg",
        "scale": 0.01, "azimuth_start_deg": 0, "azimuth_step_deg": 0.25, "observer_height_m": 2,
        "compression": "gzip", "delta_axis": "azimuth"}))
    build_results(root, "demo", [LANDING])
    return root / "regions" / "demo" / "results"


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
