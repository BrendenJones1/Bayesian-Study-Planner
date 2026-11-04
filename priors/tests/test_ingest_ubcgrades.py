import csv

import pytest
from bsp_priors import ingest_ubcgrades as u

HEADER = ["Campus", "Year", "Session", "Subject", "Course", "Reported", "Avg", *u.BINS]


def _section(year, subject, course, reported, avg, counts, session="W"):
    row = {"Campus": "UBCO", "Year": year, "Session": session, "Subject": subject,
           "Course": course, "Reported": reported, "Avg": avg}
    row.update({b: counts.get(b, 0) for b in u.BINS})
    return row


def _write(path, sections):
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, HEADER)
        w.writeheader()
        w.writerows(sections)


def _rows(course, year, counts, avg=70.0):
    return [{"course": course, "year": year, "bin": b, "students": counts.get(b, 0), "avg": avg}
            for b in u.BINS]


def test_criterion_1_writes_one_row_per_course_year_and_bin(tmp_path):
    _write(tmp_path / "a.csv", [
        _section(2021, "MATH", 100, 100, 70, {"<50": 50, "80-84": 50}),
        _section(2022, "MATH", 100, 100, 72, {"<50": 40, "90-100": 60}),
        _section(2022, "COSC", 111, 100, 80, {"85-89": 100}),
    ])
    rows = u.build_rows(tmp_path)
    assert len(rows) == 3 * len(u.BINS)
    assert len({(r["course"], r["year"], r["bin"]) for r in rows}) == len(rows)
    u.write_csv(rows, tmp_path / "out.csv")
    assert u.read_csv(tmp_path / "out.csv")[0]["course"] == "COSC 111"


def test_criterion_2_decile_slice_per_year_then_average_matches_hand_computation():
    # Year 1: decile 7 (ranks 60-70) lies wholly in 80-84 -> 1.0.
    # Year 2: ranks 60-65 in 76-79, 65-70 in 80-84 -> 0.5. Average 0.75.
    rows = _rows("MATH 100", 2021, {"<50": 50, "76-79": 10, "80-84": 20, "90-100": 20})
    rows += _rows("MATH 100", 2022, {"<50": 40, "76-79": 25, "80-84": 35})
    assert u.grade_map(rows, "MATH 100", 80, 7) == pytest.approx(0.75)


def test_criterion_3_one_year_course_uses_pooled_difficulty_group():
    # Easy group (avg >= 81): the one-year course plus another course; Hard course must not leak in.
    rows = _rows("ENGL 100", 2021, {"80-84": 100}, avg=82.0)
    rows += _rows("ART 100", 2021, {"<50": 100}, avg=80.0)  # a Medium/Hard course
    rows += _rows("ART 100", 2022, {"<50": 100}, avg=60.0)
    rows += _rows("PHIL 100", 2021, {"80-84": 50, "<50": 50}, avg=85.0)
    # Pooled Easy: 150 at 80-84, 50 at <50 -> decile 7 (ranks 140-160) is inside 80-84.
    assert u.difficulty(82.0) == "Easy" and u.difficulty(75.3) == "Medium" and u.difficulty(75.2) == "Hard"
    assert u.grade_map(rows, "ENGL 100", 80, 7) == pytest.approx(1.0)
    assert u.grade_map(rows, "ENGL 100", 80, 1) == pytest.approx(0.0)


def test_criterion_4_sections_under_10_students_are_excluded(tmp_path):
    _write(tmp_path / "a.csv", [
        _section(2021, "MATH", 100, 9, 99, {"90-100": 9}),
        _section(2021, "MATH", 100, 10, 70, {"<50": 10}),
    ])
    rows = u.build_rows(tmp_path)
    assert sum(r["students"] for r in rows) == 10
    assert rows[0]["avg"] == "70.00"


def test_criterion_5_course_code_parser_handles_ubco_quirks():
    assert u.parse_course_code("MATH_O 100") == ("MATH", "100")
    assert u.parse_course_code("MATH_O 100-001 2024W") == ("MATH", "100")
    assert u.parse_course_code("COSC_O 111 L01") == ("COSC", "111")
    assert u.parse_course_code("cosc 211A") == ("COSC", "211")
    assert u.parse_course_code("BIOL_O100-101") == ("BIOL", "100")
    assert u.parse_course_code("Welcome page") is None


def test_criterion_6_rerun_produces_identical_file(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    _write(raw / "b.csv", [_section(2022, "COSC", 111, 50, 80, {"80-84": 50})])
    _write(raw / "a.csv", [_section(2021, "MATH", 100, 50, 70, {"<50": 50})])
    u.write_csv(u.build_rows(raw), tmp_path / "1.csv")
    u.write_csv(u.build_rows(raw), tmp_path / "2.csv")
    assert (tmp_path / "1.csv").read_bytes() == (tmp_path / "2.csv").read_bytes()
