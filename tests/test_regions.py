import numpy as np
import pytest
import shapefile  # pyshp

from pipeline.projection import lonlat_to_xy
from pipeline.regions import REGIONS, load_outlines


MOON_GEOGCS = ('GEOGCS["GCS_Moon_2015",DATUM["D_Moon_2015",SPHEROID["Moon_2015_IAU_IAG",1737400.0,0.0]],'
               'PRIMEM["Reference_Meridian",0.0],UNIT["Degree",0.0174532925199433]]')


def write_shp(path, records):
    with shapefile.Writer(str(path), shapeType=shapefile.POLYGON) as w:
        w.field("Name", "C", size=50)
        for name, ring in records:
            w.poly([ring])
            w.record(name)
    path.with_suffix(".prj").write_text(MOON_GEOGCS)


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


def test_prj_must_be_geographic_degrees_on_the_lunar_sphere(tmp_path):
    write_shp(tmp_path / "a3", [("Haworth", SQUARE_SIGNED)])
    (tmp_path / "a3.prj").write_text(MOON_GEOGCS)
    assert "haworth" in load_outlines(tmp_path / "a3.shp")

    (tmp_path / "a3.prj").write_text('PROJCS["Moon2000_spole",' + MOON_GEOGCS + ',PROJECTION["Stereographic_South_Pole"]]')
    with pytest.raises(ValueError, match="projected"):
        load_outlines(tmp_path / "a3.shp")

    (tmp_path / "a3.prj").write_text(MOON_GEOGCS.replace("1737400.0", "1738100.0"))
    with pytest.raises(ValueError, match="1737400"):
        load_outlines(tmp_path / "a3.shp")


def test_multi_part_region_keeps_the_largest_area_ring(tmp_path, capsys):
    # A tiny ring with many vertices must not win over a big square with five.
    tiny = [(30.0 + 0.001 * np.cos(t), -84.0 + 0.001 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 40)]
    with shapefile.Writer(str(tmp_path / "a3"), shapeType=shapefile.POLYGON) as w:
        w.field("Name", "C", size=50)
        w.poly([tiny, SQUARE_SIGNED])
        w.record("Mons Mouton Plateau")
    (tmp_path / "a3.prj").write_text(MOON_GEOGCS)
    ring = load_outlines(tmp_path / "a3.shp")["mons-mouton-plateau"].lonlat_deg
    assert len(ring) == 5
    assert "dropped 1 smaller part(s)" in capsys.readouterr().out
