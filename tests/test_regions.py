import numpy as np
import pytest
import shapefile  # pyshp

from pipeline.projection import lonlat_to_xy
from pipeline.regions import REGIONS, load_outlines


def write_shp(path, records):
    with shapefile.Writer(str(path), shapeType=shapefile.POLYGON) as w:
        w.field("Name", "C", size=50)
        for name, ring in records:
            w.poly([ring])
            w.record(name)


SQUARE_0_360 = [(330.0, -85.0), (331.0, -85.0), (331.0, -85.5), (330.0, -85.5), (330.0, -85.0)]
SQUARE_SIGNED = [(30.0, -84.0), (31.0, -84.0), (31.0, -84.5), (30.0, -84.5), (30.0, -84.0)]


def test_registry_lists_the_nine_2024_regions():
    assert [r.region_id for r in REGIONS] == [
        "peak-near-cabeus-b", "haworth", "malapert-massif", "mons-mouton-plateau",
        "mons-mouton", "nobile-rim-1", "nobile-rim-2", "de-gerlache-rim-2", "slater-plain",
    ]
    assert {r.region_id: r.nasa_name for r in REGIONS}["de-gerlache-rim-2"] == "de Gerlache Rim 2"


def test_outlines_matched_to_ids_by_name_and_projected(tmp_path):
    write_shp(tmp_path / "a3", [("Mons_Mouton_Plateau", SQUARE_SIGNED), ("Haworth", SQUARE_0_360)])
    outlines = load_outlines(tmp_path / "a3.shp")
    assert set(outlines) == {"mons-mouton-plateau", "haworth"}

    mmp = outlines["mons-mouton-plateau"]
    x, y = lonlat_to_xy(30.0, -84.0)
    assert mmp.xy_m[0] == pytest.approx((x, y))
    assert np.array_equal(mmp.xy_m[0], mmp.xy_m[-1])  # closed ring


def test_0_360_longitudes_are_wrapped_to_signed(tmp_path):
    write_shp(tmp_path / "a3", [("Haworth", SQUARE_0_360)])
    ring = load_outlines(tmp_path / "a3.shp")["haworth"].lonlat_deg
    assert ring[:, 0].min() == pytest.approx(-30.0)
    assert ring[:, 0].max() == pytest.approx(-29.0)


def test_unknown_region_name_is_an_error(tmp_path):
    write_shp(tmp_path / "a3", [("Somewhere Else", SQUARE_SIGNED)])
    with pytest.raises(ValueError, match="Somewhere Else"):
        load_outlines(tmp_path / "a3.shp")
