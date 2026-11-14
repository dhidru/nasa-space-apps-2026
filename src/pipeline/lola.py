"""Loader for LOLA polar stereographic LDEMs (PDS3 IMG + LBL).

This is the one conversion step for LOLA (see the conventions card in
docs/data-contract.md §9): DN * SCALING_FACTOR -> meters above the 1,737.4 km
sphere, and 0-based pixel (line l, sample s) centers at
    x = (s - SAMPLE_PROJECTION_OFFSET) * MAP_SCALE
    y = (LINE_PROJECTION_OFFSET - l) * MAP_SCALE
The projection is the contract's, so x/y need no further conversion.

The image may be the full file or a band of whole lines downloaded on its own.
A band has a sidecar `<name>.band.json` = {"first_line": .., "n_lines": ..}.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .projection import R_M


@dataclass(frozen=True)
class DemGrid:
    """Heights on a regular map grid. Row 0 is the largest y."""

    heights_m: np.ndarray  # float32 [rows, cols], meters above the reference sphere
    x0_m: float  # x of column 0 pixel centers
    y0_m: float  # y of row 0 pixel centers
    pixel_m: float

    def height_at(self, x_m, y_m):
        """Bilinear height at map x/y; NaN outside the pixel-center hull."""
        col = (np.asarray(x_m, dtype=float) - self.x0_m) / self.pixel_m
        row = (self.y0_m - np.asarray(y_m, dtype=float)) / self.pixel_m
        n_rows, n_cols = self.heights_m.shape
        inside = (col >= 0) & (row >= 0) & (col <= n_cols - 1) & (row <= n_rows - 1)
        c0 = np.clip(np.floor(col).astype(int), 0, max(n_cols - 2, 0))
        r0 = np.clip(np.floor(row).astype(int), 0, max(n_rows - 2, 0))
        fc, fr = col - c0, row - r0
        h = self.heights_m
        c1 = np.minimum(c0 + 1, n_cols - 1)
        r1 = np.minimum(r0 + 1, n_rows - 1)
        top = h[r0, c0] * (1 - fc) + h[r0, c1] * fc
        bottom = h[r1, c0] * (1 - fc) + h[r1, c1] * fc
        out = np.where(inside, top * (1 - fr) + bottom * fr, np.nan)
        return out[()] if out.ndim == 0 else out


_KEY = re.compile(r'^\s*([A-Z_^]+)\s*=\s*"?([^"<]*?)"?\s*(<[^>]*>)?\s*$')


def read_label(path: Path) -> dict[str, str]:
    """Flat KEY -> value map of a PDS3 label (later keys don't overwrite earlier ones)."""
    out: dict[str, str] = {}
    for line in Path(path).read_text(encoding="latin-1").splitlines():
        m = _KEY.match(line)
        if m:
            out.setdefault(m.group(1), m.group(2).strip())
    return out


def _check(label: dict[str, str], key: str, expected: str) -> None:
    got = label.get(key)
    if got is None or got.upper() != expected:
        raise ValueError(f"{key} is {got!r}; this loader only handles {expected!r}")


def open_lola(label_path: Path, img_path: Path) -> DemGrid:
    label = read_label(label_path)
    _check(label, "MAP_PROJECTION_TYPE", "POLAR STEREOGRAPHIC")
    _check(label, "SAMPLE_TYPE", "LSB_INTEGER")
    _check(label, "SAMPLE_BITS", "16")
    _check(label, "POSITIVE_LONGITUDE_DIRECTION", "EAST")
    if float(label["CENTER_LATITUDE"]) != -90 or float(label["CENTER_LONGITUDE"]) != 0:
        raise ValueError("expected a south polar projection centered on longitude 0")
    if float(label["A_AXIS_RADIUS"]) * 1000.0 != R_M or float(label["OFFSET"]) != R_M:
        raise ValueError("expected heights and projection on the 1737.4 km sphere")

    n_lines, n_samples = int(label["LINES"]), int(label["LINE_SAMPLES"])
    first_line = 0
    band = Path(img_path).with_suffix(".band.json")
    if band.exists():
        info = json.loads(band.read_text())
        first_line, n_lines = int(info["first_line"]), int(info["n_lines"])

    dn = np.fromfile(img_path, dtype="<i2")
    if dn.size != n_lines * n_samples:
        raise ValueError(f"{img_path}: {dn.size} samples, expected {n_lines} x {n_samples}")
    heights = dn.reshape(n_lines, n_samples).astype(np.float32) * np.float32(label["SCALING_FACTOR"])

    scale = float(label["MAP_SCALE"])
    line_off = float(label["LINE_PROJECTION_OFFSET"])
    sample_off = float(label["SAMPLE_PROJECTION_OFFSET"])
    return DemGrid(
        heights_m=heights,
        x0_m=(0 - sample_off) * scale,
        y0_m=(line_off - first_line) * scale,
        pixel_m=scale,
    )
