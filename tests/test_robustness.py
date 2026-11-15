"""Timing Robustness written into sites.json, from the synthetic data folder in conftest.py."""

import json
import shutil
from pathlib import Path

from jsonschema import Draft202012Validator

from pipeline.robustness import stored_fraction, write_timing_robustness

SCHEMAS = Path(__file__).resolve().parents[1] / "contract" / "schemas"


def test_each_site_gets_the_share_of_the_supported_span_with_full_coverage(site_data: Path, tmp_path: Path):
    site_data = Path(shutil.copytree(site_data, tmp_path / "site-data"))  # the fixture is shared by the module
    path = site_data / "regions" / "demo" / "sites.json"
    before = json.loads(path.read_text(encoding="utf-8"))
    write_timing_robustness(site_data, "demo")
    after = json.loads(path.read_text(encoding="utf-8"))
    # The Sun (5.0 deg) and Earth (4.742 deg) stand still: the 0 and 1 deg Horizons never block
    # them, the 10 deg Horizon always does.
    assert [s["timing_robustness_fraction"] for s in after["sites"]] == [1.0, 0.0, 1.0]
    for s in after["sites"]:
        del s["timing_robustness_fraction"]
    assert after == before
    schema = json.loads((SCHEMAS / "sites.schema.json").read_text())
    assert [e.message for e in Draft202012Validator(schema).iter_errors(json.loads(path.read_text()))] == []


def test_stored_values_never_round_a_rare_or_an_almost_perfect_site_to_never_or_always():
    n = 52_560  # Landing Times in the Supported Span
    assert stored_fraction(1 / n) == 0.0001
    assert stored_fraction((n - 1) / n) == 0.9999
    assert [stored_fraction(0.0), stored_fraction(1.0), stored_fraction(0.37894)] == [0.0, 1.0, 0.3789]
