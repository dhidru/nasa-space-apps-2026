"""Sun and Earth positions in MOON_ME from the NAIF kernels (data-contract §6.2).

This is the only module that loads SPICE kernels (conventions card in
docs/data-contract.md §9). Vectors run from the Moon's center to the body, in
km, with LT+S (light time + stellar aberration) correction, at 600 s steps of
UTC from Jan 1 00:00:00 of each year.

    python -m pipeline.ephemeris OUT_DIR 2026 2027   # the Supported Span
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import spiceypy as spice

KERNEL_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "spice"
KERNELS = ["naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
STEP_S = 600
BODIES = [("sun", "SUN"), ("earth", "EARTH")]


def utc_steps(year: int) -> list[datetime]:
    t0 = datetime(year, 1, 1, tzinfo=timezone.utc)
    n = int((datetime(year + 1, 1, 1, tzinfo=timezone.utc) - t0).total_seconds()) // STEP_S
    return [t0 + timedelta(seconds=STEP_S * k) for k in range(n)]


def _load_kernels() -> None:
    loaded = {spice.kdata(i, "ALL")[0] for i in range(spice.ktotal("ALL"))}
    for k in KERNELS:
        path = str(KERNEL_DIR / k)
        if path not in loaded:
            spice.furnsh(path)


def positions_km(times: list[datetime]) -> np.ndarray:
    """float64 [n, 2, 3]: Sun and Earth vectors from the Moon's center, MOON_ME, km."""
    _load_kernels()
    # UTC -> ephemeris time (TDB) through the leap-second kernel, per sample.
    et = np.array([spice.str2et(t.strftime("%Y-%m-%dT%H:%M:%S")) for t in times])
    out = np.empty((len(times), len(BODIES), 3))
    for b, (_, target) in enumerate(BODIES):
        out[:, b, :], _ = spice.spkpos(target, et, "MOON_ME", "LT+S", "MOON")
    return out


def write_positions(year: int, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    times = utc_steps(year)
    arr = positions_km(times).astype("<f4")
    name = f"positions-{year}.bin"
    arr.tofile(out_dir / name)
    sidecar = {
        "schema_version": 1,
        "mock": False,
        "file": name,
        "dtype": "float32",
        "byte_order": "little",
        "shape": list(arr.shape),
        "axes": ["time", "body", "xyz"],
        "units": "km",
        "scale": 1,
        "bodies": [b for b, _ in BODIES],
        "frame": "MOON_ME",
        "aberration_correction": "LT+S",
        "start_utc": times[0].strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step_s": STEP_S,
    }
    (out_dir / f"positions-{year}.json").write_text(json.dumps(sidecar, indent=2) + "\n")
    return out_dir / name


if __name__ == "__main__":
    out, first, last = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    for y in range(first, last + 1):
        print(write_positions(y, out))
