"""Download the source datasets into data/raw/ (git-ignored).

Every source here has a license entry in ATTRIBUTIONS.md and a conventions
card in docs/data-contract.md §9. Add both before adding a source here.

    python -m pipeline.fetch small          # SPICE kernels (~44 MB); checks the USGS outlines
    python -m pipeline.fetch lola80         # LDEM_80S_80M, full file (116 MB)
    python -m pipeline.fetch lola20 REGION_ID  # LDEM_80S_20M, only the lines around one region
                                            # (needs the USGS outlines; ~100 MB for one region)
"""

from __future__ import annotations

import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

from .lola import read_label

RAW = Path(__file__).resolve().parents[2] / "data" / "raw"

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
SPICE_KERNELS = [
    "spk/planets/de440s.bsp",
    "pck/moon_pa_de440_200625.bpc",
    "fk/satellites/moon_de440_250416.tf",
    "lsk/naif0012.tls",
]
# ScienceBase puts a CAPTCHA in front of this file, so a person downloads it by
# hand from the "Attached Files" list and saves it as USGS_OUTLINES_ZIP.
USGS_PAGE = "https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8"
USGS_OUTLINES_ZIP = RAW / "usgs" / "A3_9regions-lonlat-simplified.zip"
USGS_OUTLINES_SIZE = 637_136
LOLA_BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"


def _get(url: str, dest: Path, byte_range: tuple[int, int] | None = None) -> None:
    if dest.exists():
        print(f"have {dest.relative_to(RAW)}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url)
    if byte_range:
        req.add_header("Range", f"bytes={byte_range[0]}-{byte_range[1] - 1}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req) as resp, open(tmp, "wb") as out:
        if byte_range and resp.status != 206:
            raise RuntimeError(f"{url}: server ignored the Range request (HTTP {resp.status})")
        shutil.copyfileobj(resp, out, length=1 << 20)
    if byte_range and tmp.stat().st_size != byte_range[1] - byte_range[0]:
        raise RuntimeError(f"{url}: got {tmp.stat().st_size} bytes, expected {byte_range[1] - byte_range[0]}")
    tmp.replace(dest)
    print(f"got  {dest.relative_to(RAW)} ({dest.stat().st_size:,} bytes)")


def fetch_small() -> None:
    for k in SPICE_KERNELS:
        _get(NAIF + k, RAW / "spice" / Path(k).name)
    z = USGS_OUTLINES_ZIP
    if not z.exists() or z.stat().st_size != USGS_OUTLINES_SIZE:
        print(f"MISSING {z}: download A3_9regions-lonlat-simplified.zip by hand from {USGS_PAGE}")
        return
    with zipfile.ZipFile(z) as zf:
        zf.extractall(z.with_suffix(""))
    print(f"unzipped {z.name}")


def fetch_lola80() -> None:
    for ext in ("lbl", "img"):
        _get(LOLA_BASE + f"ldem_80s_80m.{ext}", RAW / "lola" / f"ldem_80s_80m.{ext}")


# Near-field Horizon range (5 km) plus the base-map margin, with room to spare.
BAND_MARGIN_M = 8_000.0


def fetch_lola20_for_region(region_id: str) -> None:
    from .regions import load_outlines

    shp = next(USGS_OUTLINES_ZIP.with_suffix("").rglob("*.shp"))
    xy = load_outlines(shp)[region_id].xy_m
    fetch_lola20_band(xy[:, 1].min() - BAND_MARGIN_M, xy[:, 1].max() + BAND_MARGIN_M)


def fetch_lola20_band(y_min_m: float, y_max_m: float) -> None:
    """Download only the lines of LDEM_80S_20M whose pixel centers span [y_min, y_max]."""
    lbl = RAW / "lola" / "ldem_80s_20m.lbl"
    _get(LOLA_BASE + "ldem_80s_20m.lbl", lbl)
    label = read_label(lbl)
    scale, line_off = float(label["MAP_SCALE"]), float(label["LINE_PROJECTION_OFFSET"])
    n_lines, record = int(label["LINES"]), int(label["RECORD_BYTES"])
    first = max(0, int((line_off - y_max_m / scale) // 1))
    last = min(n_lines, int(-(-(line_off - y_min_m / scale) // 1)) + 1)
    img = RAW / "lola" / f"ldem_80s_20m_lines{first}-{last}.img"
    _get(LOLA_BASE + "ldem_80s_20m.img", img, (first * record, last * record))
    img.with_suffix(".band.json").write_text(json.dumps({"first_line": first, "n_lines": last - first}))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "small":
        fetch_small()
    elif cmd == "lola80":
        fetch_lola80()
    elif cmd == "lola20":
        fetch_lola20_for_region(sys.argv[2])
    else:
        sys.exit(__doc__)
