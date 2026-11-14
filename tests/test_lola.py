import json

import numpy as np
import pytest

from pipeline.lola import open_lola

# A miniature PDS3 label in the shape of ldem_80s_20m.lbl (values changed for a 6 x 6 grid).
LABEL = """PDS_VERSION_ID = "PDS3"
RECORD_TYPE = FIXED_LENGTH
RECORD_BYTES = 12
FILE_RECORDS = 6
^IMAGE = "TINY.IMG"
OBJECT = IMAGE
  LINES = 6
  LINE_SAMPLES = 6
  SAMPLE_TYPE = LSB_INTEGER
  SAMPLE_BITS = 16
  UNIT = METER
  SCALING_FACTOR = 0.5
  OFFSET = 1737400.
END_OBJECT = IMAGE
OBJECT = IMAGE_MAP_PROJECTION
  ^DATA_SET_MAP_PROJECTION = "DSMAP.CAT"
  MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"
  A_AXIS_RADIUS = 1737.4 <KM>
  CENTER_LATITUDE = -90 <DEG>
  CENTER_LONGITUDE = 0 <DEG>
  MAP_SCALE = 100 <METERS/PIXEL>
  LINE_PROJECTION_OFFSET = 2.5 <PIXEL>
  SAMPLE_PROJECTION_OFFSET = 2.5 <PIXEL>
  POSITIVE_LONGITUDE_DIRECTION = "EAST"
  COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"
END_OBJECT = IMAGE_MAP_PROJECTION
END
"""

# DN = 10 * line + sample, so height = 0.5 * DN.
DN = (10 * np.arange(6)[:, None] + np.arange(6)[None, :]).astype("<i2")


@pytest.fixture
def tiny(tmp_path):
    (tmp_path / "tiny.lbl").write_text(LABEL)
    DN.tofile(tmp_path / "tiny.img")
    return tmp_path


def test_heights_are_dn_times_half_at_pixel_centers(tiny):
    dem = open_lola(tiny / "tiny.lbl", tiny / "tiny.img")
    # Pixel (line 0, sample 0) center: x = (0 - 2.5) * 100, y = (2.5 - 0) * 100.
    assert dem.height_at(-250.0, 250.0) == pytest.approx(0.0)
    # Line 1, sample 4 -> DN 14 -> 7 m; x = 150, y = 150.
    assert dem.height_at(150.0, 150.0) == pytest.approx(7.0)
    # Last pixel: line 5, sample 5 -> DN 55.
    assert dem.height_at(250.0, -250.0) == pytest.approx(27.5)


def test_bilinear_between_pixel_centers(tiny):
    dem = open_lola(tiny / "tiny.lbl", tiny / "tiny.img")
    # Halfway between (line 1, sample 1) DN 11 and (line 2, sample 2) DN 22 -> DN 16.5.
    assert dem.height_at(-100.0, 100.0) == pytest.approx(8.25)


def test_outside_the_grid_is_nan(tiny):
    dem = open_lola(tiny / "tiny.lbl", tiny / "tiny.img")
    assert np.isnan(dem.height_at(1000.0, 0.0))


def test_grid_geometry_exposed_for_ray_marching(tiny):
    dem = open_lola(tiny / "tiny.lbl", tiny / "tiny.img")
    assert dem.pixel_m == 100.0
    assert (dem.x0_m, dem.y0_m) == (-250.0, 250.0)
    assert dem.heights_m.shape == (6, 6)
    assert dem.heights_m.dtype == np.float32


def test_row_band_matches_full_file(tiny):
    # A band of lines 2..4 saved on its own, with a sidecar saying where it starts.
    DN[2:5].tofile(tiny / "band.img")
    (tiny / "band.band.json").write_text(json.dumps({"first_line": 2, "n_lines": 3}))
    full = open_lola(tiny / "tiny.lbl", tiny / "tiny.img")
    band = open_lola(tiny / "tiny.lbl", tiny / "band.img")
    assert band.heights_m.shape == (3, 6)
    for x, y in [(-250.0, 50.0), (150.0, -50.0), (0.0, 0.0)]:
        assert band.height_at(x, y) == pytest.approx(full.height_at(x, y))
    assert np.isnan(band.height_at(0.0, 250.0))  # line 0 is not in the band


def test_rejects_unexpected_projection(tiny):
    (tiny / "bad.lbl").write_text(LABEL.replace('"POLAR STEREOGRAPHIC"', '"EQUIRECTANGULAR"'))
    with pytest.raises(ValueError, match="POLAR STEREOGRAPHIC"):
        open_lola(tiny / "bad.lbl", tiny / "tiny.img")
