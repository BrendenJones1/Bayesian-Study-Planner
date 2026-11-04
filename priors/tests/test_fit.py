import json
from collections import Counter

import pytest
from bsp_priors import fit
from bsp_priors.ingest_ubcgrades import grade_map, read_csv

LEVELS = ["Low", "Med", "High"]


@pytest.fixture(scope="module")
def built():
    return fit.build(built_at="2026-01-01T00:00:00+00:00")


def _p(built, table, given, state):
    t = built["tables"][table]
    return t["values"]["|".join(given)][t["states"].index(state)]


def _learned(built):
    return {k: v for k, v in built["tables"].items() if k != "grade_map"}


def test_criterion_1_laplace_formula_and_worked_example():
    # design-v2: 78 of 412 rows in decile 8 -> (78 + 1) / (412 + 10) = 79/422 = 0.187
    counts = Counter({"8": 78, "1": 334})
    p = fit.smooth(counts, fit.DECILES)
    assert p[7] == pytest.approx(79 / 422)
    assert round(p[7], 3) == 0.187


def test_criterion_2_rows_sum_to_one_and_no_zero(built):
    for name, t in _learned(built).items():
        for key, row in t["values"].items():
            assert sum(row) == pytest.approx(1, abs=1e-9), (name, key)
            assert min(row) > 0, (name, key)


def test_criterion_3_alpha_is_a_parameter():
    counts = Counter({"Low": 3, "Med": 1})  # High is an empty cell
    assert fit.smooth(counts, LEVELS, alpha=0)[2] == 0
    assert fit.smooth(counts, LEVELS, alpha=1)[2] == pytest.approx(1 / 7)
    assert fit.smooth(counts, LEVELS, alpha=5)[2] == pytest.approx(5 / 19)


def test_criterion_4_cpts_json_lists_every_table(built):
    out = json.loads(json.dumps(built))
    assert out["model_version"] and out["built_at"]
    assert set(out["tables"]) == {"study", "exam_standing", "final_standing_g25", "final_standing_g50",
                                  "stress_now", "stress_next", "grade_map"}
    for name, t in _learned(out).items():
        assert t["parents"] and t["states"] and t["values"], name
    assert list(out["tables"]["exam_standing"]["parents"]) == ["perf", "study", "timeliness", "exam_difficulty"]
    assert len(out["tables"]["exam_standing"]["values"]) == 81
    assert len(out["tables"]["final_standing_g25"]["values"]) == 60


def test_criterion_5_cut_points_for_the_extension(built):
    c = built["cut_points"]
    assert c["study_active_day_share"] == {"low_max": 0.1991701244813278, "med_max": 0.40963855421686746}
    assert c["study_volume_hours_per_course_week"] == {"low_max": 2.0, "med_max": 4.0}
    assert c["study_level_sum"] == {"Low": [0, 1], "Med": [2], "High": [3, 4]}
    assert c["load_deadlines_next_3_days"] == {"low_max": 0.0, "med_max": 1.0}
    assert c["item_weight_share_of_final_grade"] == 0.15
    assert c["timeliness"]["states"] == ["On time", "Some late", "Often late or missing"]


def test_criterion_6_hand_calculated_entries_match(built):
    # Counts below were tallied by hand from the train rows of the committed CSVs.
    assert _p(built, "study", ["High"], "High") == pytest.approx(25777 / 50576)  # 25776 of 50573
    assert _p(built, "study", ["Low"], "Low") == pytest.approx(24118 / 50525)  # 24117 of 50522
    u = ["High", "High", "On time", "Hard"]
    assert _p(built, "exam_standing", u, "10") == pytest.approx(618 / 2116)  # 617 of 2106
    u = ["Low", "Low", "Often late or missing", "Easy"]
    assert _p(built, "exam_standing", u, "1") == pytest.approx(305 / 1488)  # 304 of 1478
    assert _p(built, "final_standing_g25", ["Med", "5", ">15%"], "6") == pytest.approx(41 / 77)  # 40 of 67
    assert _p(built, "final_standing_g25", ["Med", "5", ">15%"], "1") == pytest.approx(1 / 77)  # empty cell
    assert _p(built, "final_standing_g50", ["High", "10", "<=15%"], "10") == pytest.approx(121 / 264)  # 120 of 254
    assert _p(built, "stress_now", ["Low"], "Med") == pytest.approx(340 / 702)  # 339 of 699
    assert _p(built, "stress_next", ["Low", "Low"], "Low") == pytest.approx(52 / 110)  # 51 of 107


def test_criterion_7_ubc_grade_map_copied_exactly(built):
    bins = read_csv(fit.TABLES / "ubc_grade_bins.csv")
    gm = built["tables"]["grade_map"]["courses"]
    by_years = {}
    for r in bins:
        by_years.setdefault(r["course"], set()).add(r["year"])
    multi = next(c for c, y in by_years.items() if len(y) >= 2)
    single = next(c for c, y in by_years.items() if len(y) < 2)  # pooled difficulty group
    for course in (multi, single):
        for t, d in [(50, 1), (68, 5), (80, 7), (90, 10)]:
            assert gm[course][str(t)][d - 1] == pytest.approx(grade_map(bins, course, t, d), abs=1e-12)


def test_split_parameter_changes_counts():
    train, test = fit.build(), fit.build("test")
    assert train["split"] == "train" and test["split"] == "test"
    assert train["tables"]["study"] != test["tables"]["study"]
