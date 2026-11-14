"""Validate a data folder against the data contract (docs/data-contract.md).

Usage (from the repo root, with jsonschema installed: pip install -r requirements-dev.txt):

    python contract/validate.py contract/mock/data

It checks:
- every JSON file against its schema in contract/schemas/
- each .bin file's size (unpacked, for .bin.gz) against its sidecar's shape and dtype
- cross-file consistency (site counts, top-10 spacing, ranking order)
"""

from __future__ import annotations

import gzip
import json
import math
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMAS = Path(__file__).resolve().parent / "schemas"
DTYPE_SIZE = {"int16": 2, "float32": 4}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def schema_for(rel: Path) -> str | None:
    parts, name = rel.parts, rel.name
    if name == "regions.json":
        return "regions"
    if name == "outline.geojson":
        return "outline"
    if name == "sites.json":
        return "sites"
    if name == "basemap.json":
        return "basemap"
    if name in ("horizons.json",) or parts[0] == "ephemeris":
        return "binary-sidecar"
    if "ranking" in parts:
        return "ranking"
    if "site-detail" in parts:
        return "site-detail"
    if "landing-windows" in parts:
        return "landing-windows"
    return None


def main(root: Path) -> int:
    errors: list[str] = []
    validators = {p.name.removesuffix(".schema.json"): Draft202012Validator(load(p))
                  for p in SCHEMAS.glob("*.schema.json")}
    n = 0
    for path in sorted(list(root.rglob("*.json")) + list(root.rglob("*.geojson"))):
        rel = path.relative_to(root)
        kind = schema_for(rel)
        if kind is None:
            errors.append(f"{rel}: no schema matches this file")
            continue
        doc = load(path)
        for e in validators[kind].iter_errors(doc):
            errors.append(f"{rel} [{kind}] at /{'/'.join(map(str, e.path))}: {e.message[:200]}")
        n += 1
        if kind == "binary-sidecar":
            bin_path = path.with_name(doc["file"])
            if len(doc["shape"]) != len(doc["axes"]):
                errors.append(f"{rel}: shape and axes lengths differ")
            if not bin_path.exists():
                errors.append(f"{rel}: missing {bin_path.name}")
            else:
                want = math.prod(doc["shape"]) * DTYPE_SIZE[doc["dtype"]]
                if doc.get("compression") == "gzip":
                    try:
                        size = len(gzip.decompress(bin_path.read_bytes()))
                    except (OSError, EOFError) as e:
                        errors.append(f"{rel}: {bin_path.name} is not a valid gzip stream ({e})")
                        size = want
                else:
                    size = bin_path.stat().st_size
                if size != want:
                    errors.append(f"{rel}: {bin_path.name} is {size} bytes unpacked, expected {want}")
                if "delta_axis" in doc and doc["delta_axis"] != doc["axes"][-1]:
                    errors.append(f"{rel}: delta_axis must be the innermost axis {doc['axes'][-1]!r}")

    # Cross-file checks per region with site data.
    regions = load(root / "regions.json")
    for reg in regions["regions"]:
        folder = root / "regions" / reg["id"]
        for f in (reg["outline"], reg["basemap"]):
            if not (root / f).exists():
                errors.append(f"regions.json: {reg['id']} points to missing {f}")
        if not reg["has_site_data"]:
            continue
        sites = load(folder / "sites.json")["sites"]
        by_id = {s["site_id"]: s for s in sites}
        if len(by_id) != len(sites):
            errors.append(f"{reg['id']}: duplicate site ids")
        hz = load(folder / "horizons.json")
        if hz["shape"][0] != len(sites):
            errors.append(f"{reg['id']}: horizons rows {hz['shape'][0]} != sites {len(sites)}")
        for rk_path in (folder / "results" / "ranking").glob("*.json"):
            rk = load(rk_path)
            ranked = rk["sites"]
            if sorted(e["site_id"] for e in ranked) != sorted(by_id):
                errors.append(f"{rk_path.name}: ranking does not cover exactly the site grid")
            if [e["rank"] for e in ranked] != list(range(1, len(ranked) + 1)):
                errors.append(f"{rk_path.name}: ranks are not 1..n in order")
            seen_partial = False
            for e in ranked:
                if e["coverage"] == "partial":
                    seen_partial = True
                elif seen_partial:
                    errors.append(f"{rk_path.name}: full-coverage site {e['site_id']} ranked after a partial one")
                    break
            top = [by_id[e["site_id"]] for e in ranked if e["top"]]
            if len(top) > rk["top_n"]:
                errors.append(f"{rk_path.name}: more than top_n sites flagged")
            for i, a in enumerate(top):
                for b in top[i + 1:]:
                    if math.hypot(a["x_m"] - b["x_m"], a["y_m"] - b["y_m"]) < rk["top_separation_m"]:
                        errors.append(f"{rk_path.name}: top sites {a['site_id']} and {b['site_id']} too close")
        for d_path in (folder / "results" / "site-detail").rglob("*.json"):
            d = load(d_path)
            n_s = d["n_samples"]
            arrays = [d["series"]["time_utc"]] + [d["series"][b][k] for b in ("sun", "earth")
                                                   for k in ("azimuth_deg", "elevation_deg", "horizon_elevation_deg")]
            if any(len(a) != n_s for a in arrays):
                errors.append(f"{d_path.name}: series lengths differ from n_samples")

    for e in errors:
        print("ERROR", e)
    print(f"checked {n} files: {'OK' if not errors else f'{len(errors)} error(s)'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "contract/mock/data")))
