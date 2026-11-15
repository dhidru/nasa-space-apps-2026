import numpy as np
import pytest

from pipeline.scoring import body_stats, timing_robustness_fraction, landing_windows, rank_sites, select_top


def test_body_stats_count_only_positive_clearance_as_line_of_sight():
    el = np.array([[1.0, 2.0, 3.0, 4.0]])
    clr = np.array([[0.5, -0.1, 0.0, 2.0]])  # Clearance 0 is not Line of Sight (GLOSSARY.md)
    s = body_stats(el, clr, step_s=600)
    assert s["min_elevation_deg"][0] == 1.0
    assert s["mean_elevation_deg"][0] == 2.5
    assert s["max_elevation_deg"][0] == 4.0
    assert s["min_clearance_deg"][0] == pytest.approx(-0.1)
    assert s["mean_clearance_deg"][0] == pytest.approx(0.6)
    assert s["max_clearance_deg"][0] == 2.0
    assert s["los_fraction"][0] == 0.5
    assert s["los_duration_h"][0] == pytest.approx(2 * 600 / 3600)
    assert s["first_los_loss_index"][0] == 1


def test_a_body_that_never_loses_line_of_sight_has_no_first_loss():
    s = body_stats(np.ones((2, 3)), np.array([[0.1, 0.2, 0.3], [1.0, -1.0, 1.0]]), step_s=600)
    assert list(s["first_los_loss_index"]) == [-1, 1]
    assert list(s["los_fraction"]) == [1.0, pytest.approx(2 / 3)]


def _stats(min_c, mean_c, frac):
    return {"min_clearance_deg": np.array(min_c, float), "mean_clearance_deg": np.array(mean_c, float),
            "los_fraction": np.array(frac, float)}


def test_ranking_puts_full_coverage_first_then_orders_by_the_design_rules():
    # Sites:            A     B     C     D      E
    sun = _stats([1.0, 1.0, 3.0, -1.0, -0.5], [2.0, 3.0, 4.0, 1.0, 1.0], [1, 1, 1, 0.9, 0.6])
    earth = _stats([5.0, 4.0, 2.0, -2.0, -0.1], [2.0, 3.0, 4.0, 1.0, 1.0], [1, 1, 1, 0.5, 0.7])
    r = rank_sites(sun, earth)
    # C has the best worst-case Clearance (2.0); A and B tie at 1.0 and B has more mean
    # Clearance; among partial sites E's weaker body (60 %) beats D's (50 %).
    assert list(r.order) == [2, 1, 0, 4, 3]
    assert list(r.full) == [True, True, True, False, False]
    np.testing.assert_allclose(r.worst_case_min_clearance_deg, [1.0, 1.0, 2.0, -2.0, -0.5])


def test_top_sites_skip_any_site_within_the_separation_of_an_earlier_pick():
    # Ranked order: sites 0..4. Site 1 is 1,999 m from site 0, so it is skipped; site 2 is
    # exactly 2,000 m away and counts as separated; site 3 is near site 2.
    x = np.array([0.0, 1999.0, 2000.0, 2100.0, -5000.0])
    y = np.zeros(5)
    assert select_top(np.arange(5), x, y, n=10, separation_m=2000.0) == [0, 2, 4]
    assert select_top(np.array([4, 3, 2, 1, 0]), x, y, n=2, separation_m=2000.0) == [4, 3]


# Worst-case Clearance per sample for 10 Landing Times with 3-sample stays. Sample 4 is
# blocked, so Landing Times 2, 3 and 4 are Partial. Worked by hand, each stay's minimum
# is 0.5, 0.5, -, -, -, 1, 3, 2, 2, 2.
WORST = np.array([0.5, 0.5, 0.5, 1, -1, 1, 3, 3, 3, 2, 2, 2])


def test_landing_window_strip_tiles_the_search_with_runs_of_equal_coverage():
    lw = landing_windows(WORST, stay_samples=3, merge_gap_steps=3, top_n=10)
    assert lw.runs == [(0, 2, True), (2, 5, False), (5, 10, True)]


def test_windows_closer_than_the_merge_gap_are_merged_and_flagged():
    apart = landing_windows(WORST, stay_samples=3, merge_gap_steps=3, top_n=10)  # gap 3 is not < 3
    assert [(w.start, w.end, w.contains_partial_gaps, w.best, w.best_worst_case_min_clearance_deg)
            for w in apart.windows] == [(5, 10, False, 6, 3.0), (0, 2, False, 0, 0.5)]
    merged = landing_windows(WORST, stay_samples=3, merge_gap_steps=4, top_n=10)
    assert [(w.start, w.end, w.contains_partial_gaps, w.best) for w in merged.windows] == [(0, 10, True, 6)]


def test_only_the_top_n_windows_are_kept_and_partial_only_sites_have_none():
    assert len(landing_windows(WORST, stay_samples=3, merge_gap_steps=3, top_n=1).windows) == 1
    none = landing_windows(-np.ones(12), stay_samples=3, merge_gap_steps=3, top_n=10)
    assert none.windows == [] and none.runs == [(0, 10, False)]


def test_timing_robustness_is_the_share_of_landing_times_with_full_coverage():
    # WORST has Full Coverage at Landing Times 0, 1 and 5-9: 7 of 10. A site that is always
    # in Line of Sight scores 1, and Clearance of exactly 0 is not Line of Sight (GLOSSARY.md).
    worst = np.stack([WORST, np.ones(12), np.zeros(12)])
    np.testing.assert_allclose(timing_robustness_fraction(worst, stay_samples=3), [0.7, 1.0, 0.0])


def test_a_sample_without_a_clearance_counts_as_blocked_like_in_landing_windows():
    worst = WORST.copy()
    worst[0] = np.nan  # landing_windows: NaN > 0 is false, so Landing Time 0 isn't Full
    assert landing_windows(worst, stay_samples=3, merge_gap_steps=3, top_n=10).runs[0] == (0, 1, False)
    np.testing.assert_allclose(timing_robustness_fraction(worst[None], stay_samples=3), [0.6])
