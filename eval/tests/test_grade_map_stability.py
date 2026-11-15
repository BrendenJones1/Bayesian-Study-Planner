from bsp_eval.grade_map_stability import stability


def _c(course, year, avg, hi, lo):
    return [{"course": course, "year": year, "bin": "80-84", "students": hi, "avg": avg},
            {"course": course, "year": year, "bin": "<50", "students": lo, "avg": avg}]


ROWS = (_c("E 1", 2021, 85, 5, 5) + _c("E 1", 2022, 85, 5, 5) + _c("E 1", 2024, 85, 9, 1)
        + _c("H 1", 2021, 70, 5, 5) + _c("H 1", 2023, 70, 5, 5) + _c("H 1", 2025, 70, 2, 8)
        + _c("E 1", 2023, 86, 1, 1) + _c("N 1", 2022, 78, 5, 5) + _c("N 1", 2024, 78, 10, 0))


def test_criterion_1_difficulty_from_2021_23_outcomes_from_2024_25():
    # 2023 rows must not count as outcomes; 2021-22 must not count as outcomes either
    assert stability(ROWS)["students"] == {"Easy": 10, "Medium": 0, "Hard": 10}


def test_criterion_2_reports_p_by_difficulty_group():
    p = stability(ROWS)["p_at_or_above_target"]
    assert p == {"Easy": 0.9, "Medium": None, "Hard": 0.2}


def test_criterion_3_reports_successive_year_correlation():
    r = stability(ROWS)
    assert r["successive_year_pairs"] == 3 and -1 <= r["successive_year_average_correlation"] <= 1


def test_criterion_4_courses_under_2_early_years_reported_separately():
    r = stability(ROWS)
    assert r["courses_under_2_early_years"] == ["N 1"]


def test_criterion_5_results_file_is_written(tmp_path):
    import json

    from bsp_eval.grade_map_stability import ROOT, write
    out = tmp_path / "grade_map_stability.json"
    write(out)
    assert json.loads(out.read_text())["target"] == 80
    assert (ROOT / "eval/results").name == "results"  # default path
