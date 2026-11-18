from pathlib import Path

import numpy as np
import pandas as pd
from bsp_priors import ingest_oulad as o

WEIGHTS = [10] * 5 + [20] + [10] * 3  # shares .1 each, item 6 is .2; checkpoints land on items 4 and 6
WITHDRAWN = {41, 42, 141, 142}


def make(seed=1):
    """Two presentations of one module: 2013J is easy (high scores), 2014J is hard."""
    rng = np.random.default_rng(seed)
    info, ass, sa, vle = [], [], [], []
    for pres, first, aid0, base, scale in (("2013J", 1, 1, 60, 1), ("2014J", 101, 11, 10, 2)):
        for i, w in enumerate(WEIGHTS):
            ass.append(("AAA", pres, aid0 + i, "TMA", 10 * (i + 1), w * scale))
        for s in range(first, first + 44):
            gone = s in WITHDRAWN
            info.append(("AAA", pres, s, "Withdrawn" if gone else "Pass"))
            ability = rng.random()
            for i in range(9):
                if rng.random() < 0.9:
                    score = 0.0 if gone else base + 35 * ability + 5 * rng.random()
                    sa.append((aid0 + i, s, 10 * (i + 1) + int(rng.integers(-3, 6)), score))
            for day in range(0, 100, 5):
                vle.append(("AAA", pres, s, 1, day, int(1 + 20 * ability * rng.random())))
    cols = ["code_module", "code_presentation"]
    return {
        "info": pd.DataFrame(info, columns=[*cols, "id_student", "final_result"]),
        "courses": pd.DataFrame(
            [("AAA", "2013J", 100), ("AAA", "2014J", 100)],
            columns=[*cols, "module_presentation_length"],
        ),
        "assessments": pd.DataFrame(
            ass, columns=[*cols, "id_assessment", "assessment_type", "date", "weight"]
        ),
        "student_assessment": pd.DataFrame(
            sa, columns=["id_assessment", "id_student", "date_submitted", "score"]
        ),
        "student_vle": pd.DataFrame(
            vle, columns=[*cols, "id_student", "id_site", "date", "sum_click"]
        ),
    }


def test_criterion_1_writes_four_csvs_in_design_layout(tmp_path: Path):
    raw = tmp_path / "raw"
    raw.mkdir()
    for k, f in zip(
        ("info", "courses", "assessments", "student_assessment", "student_vle"),
        ("studentInfo", "courses", "assessments", "studentAssessment", "studentVle"),
    ):
        make()[k].to_csv(raw / f"{f}.csv", index=False)
    out = tmp_path / "out"
    o.write_all(raw, out)
    cols = {
        "oulad_exam_standing": ["perf", "study", "timeliness", "exam_difficulty", "exam_standing"],
        "oulad_final_standing_g25": ["perf", "exam_standing", "item_weight", "final_standing"],
        "oulad_final_standing_g50": ["perf", "exam_standing", "item_weight", "final_standing"],
        "oulad_study": ["perf", "study"],
    }
    for name, c in cols.items():
        df = pd.read_csv(out / f"{name}.csv")
        assert len(df) > 0 and set(c) <= set(df.columns), name
    assert not (out / "oulad_final_standing_g75.csv").exists()  # design: checkpoints are 25 and 50 only
    ex = pd.read_csv(out / "oulad_exam_standing.csv")
    assert set(ex.perf) <= set(o.LEVELS) and set(ex.timeliness) <= set(o.TIMELINESS)
    assert ex.exam_standing.between(1, 10).all()


def test_criterion_2_no_leakage_poisoned_later_data_leaves_row_unchanged():
    t = 50  # assessment 5 / 15
    base = o.build_tables(**make())
    d = make()
    sa = d["student_assessment"].merge(d["assessments"][["id_assessment", "date"]])
    later = sa.date > t
    d["student_assessment"].loc[later.values, "score"] = 100 - sa.score[later]
    d["student_assessment"].loc[later.values, "date_submitted"] += 100
    v = d["student_vle"]
    v.loc[v.date >= t, "sum_click"] = 1000 - v.sum_click
    poisoned = o.build_tables(**d)
    early_ids = [*range(1, 6), *range(11, 16)]

    def pick(df, early):
        return df[df.id_assessment.isin(early_ids) == early].reset_index(drop=True)

    for i in (0, 1):  # study, exam_standing
        assert pick(base[i], True).equals(pick(poisoned[i], True))
        assert not pick(base[i], False).equals(pick(poisoned[i], False))  # poison had an effect


def test_criterion_3_ranks_are_within_each_presentation_not_pooled():
    exam = o.build_tables(**make())[1]
    for _, g in exam.groupby("code_presentation"):
        deciles = g[g.id_assessment % 10 == 5].exam_standing.value_counts()
        assert set(deciles.index) == set(range(1, 11))  # pooled ranks would leave the hard class in 1-5
        assert deciles.max() - deciles.min() <= 2
        assert g.perf.value_counts().min() >= 0.25 * len(g)


def test_criterion_4_withdrawn_students_are_excluded():
    study, exam, finals, split, _ = o.build_tables(**make())
    for df in (study, exam, *finals.values(), split):
        assert not set(df.id_student) & WITHDRAWN
    assert len(split) == 84


def test_criterion_5_item_weight_is_share_of_final_grade_cut_at_15_percent():
    finals = o.build_tables(**make())[2]
    # 2014J raw weights are doubled; raw 20 > 15 but the share is still 10%
    assert set(finals[25].item_weight) == {"<=15%"}
    assert set(finals[50].item_weight) == {">15%"}  # share 20%
    assert set(finals[50].code_presentation) == {"2013J", "2014J"}


def test_criterion_6_split_is_80_20_by_student_fixed_seed_and_saved(tmp_path: Path):
    d = make()
    split = o.build_tables(**d)[3]
    assert split.id_student.is_unique
    assert (split.split == "test").sum() == round(0.2 * len(split))
    assert o.build_tables(**make())[3].equals(split)
    raw = tmp_path / "raw"
    raw.mkdir()
    for k, f in zip(d, ("studentInfo", "courses", "assessments", "studentAssessment", "studentVle")):
        d[k].to_csv(raw / f"{f}.csv", index=False)
    o.write_all(raw, tmp_path / "out")
    saved = pd.read_csv(tmp_path / "out" / "oulad_split.csv")
    assert saved.equals(split)


def test_criterion_7_report_counts_students_per_parent_cell_and_flags_under_30():
    cell = {"perf": "Low", "study": "Low", "timeliness": "On time"}
    rows = [dict(id_student=i, exam_difficulty="Easy", **cell) for i in range(30)]
    rows += [dict(id_student=100 + i, exam_difficulty="Hard", **cell) for i in range(29)]
    rows += [dict(rows[0])]  # the same student twice counts once
    rep = o.cell_report(
        pd.DataFrame(rows),
        pd.DataFrame({"id_student": [r["id_student"] for r in rows], "split": "train"}),
    ).set_index(["perf", "study", "timeliness", "exam_difficulty"])
    assert len(rep) == 81
    assert rep.loc[("Low", "Low", "On time", "Easy")].tolist() == [30, False]
    assert rep.loc[("Low", "Low", "On time", "Hard")].tolist() == [29, True]
    assert rep.loc[("High", "High", "On time", "Hard")].tolist() == [0, True]


def test_licence_readme_is_written_next_to_the_csvs():
    text = (Path(__file__).parents[1] / "data" / "README.md").read_text()
    assert text == o.ATTRIBUTION
    for s in ("10.1038/sdata.2017.171", "10.24432/C5KK69", "CC BY 4.0",
              "creativecommons.org/licenses/by/4.0", "modified: aggregated and discretised".capitalize()):
        assert s in text


def test_summary_line_counts_sparse_cells_from_the_sparse_column():
    rep = pd.DataFrame({"n_students": [5, 40, 12], "sparse": [True, False, True]})
    assert o.sparse_summary(rep) == "2 of 3 Exam-standing cells under 30 students"


def test_checkpoints_are_25_and_50_only():
    finals = o.build_tables(**make())[2]
    assert o.CHECKPOINTS == (25, 50)
    assert set(finals) == {25, 50}
    assert all(len(df) > 0 for df in finals.values())


def test_active_share_is_active_days_over_days_elapsed_before_the_assessment():
    clicks = pd.DataFrame({"id_student": [1, 1, 1, 1, 2, 2], "date": [-5, 0, 2, 5, 3, 12], "sum_click": [9] * 6})
    got = o.active_share(clicks, pd.Index([1, 2, 3]), 10)  # days before the start and from day 10 on do not count
    assert got.to_dict() == {1: 0.3, 2: 0.1, 3: 0.0}


def test_study_cuts_are_thirds_of_active_share_from_train_students_only():
    base = o.build_tables(**make())
    cuts, split = base[4], base[3]
    assert 0 < cuts["low_max"] <= cuts["med_max"] <= 1
    test_ids = set(split[split.split == "test"].id_student)
    d = make()
    d["student_vle"].loc[d["student_vle"].id_student.isin(test_ids), "date"] = -1  # test students never active
    assert o.build_tables(**d)[4] == cuts
    d = make()
    d["student_vle"].loc[~d["student_vle"].id_student.isin(test_ids), "date"] = -1  # train students never active
    assert o.build_tables(**d)[4] != cuts


def test_write_all_writes_the_study_cuts_file(tmp_path: Path):
    import json

    raw = tmp_path / "raw"
    raw.mkdir()
    for k, f in zip(
        ("info", "courses", "assessments", "student_assessment", "student_vle"),
        ("studentInfo", "courses", "assessments", "studentAssessment", "studentVle"),
    ):
        make()[k].to_csv(raw / f"{f}.csv", index=False)
    o.write_all(raw, tmp_path / "out")
    got = json.loads((tmp_path / "out" / "oulad_study_cuts.json").read_text())
    assert set(got) == {"active_day_share", "definition"}
    assert set(got["active_day_share"]) == {"low_max", "med_max"}


def _grp(rows):
    """One presentation's assessments: (id_assessment, assessment_type, date)."""
    return pd.DataFrame(rows, columns=["id_assessment", "assessment_type", "date"])


def test_issue_169_exam_difficulty_uses_only_assessments_dated_before_it():
    # Predicting TMA 4 (day 20): earlier = CMAs 1 and 3, covered = CMA 3 (after TMA 2). Gap 60 - 60 = 0: Med.
    grp = _grp([(1, "CMA", 5), (2, "TMA", 10), (3, "CMA", 15), (4, "TMA", 20), (5, "CMA", 20), (6, "CMA", 30)])
    means = pd.Series({1: 60.0, 2: 70.0, 3: 60.0, 4: 70.0})
    assert o.exam_difficulty(20, "TMA", grp, means) == "Med"
    # Same-day CMA 5 would make it Hard (35 vs 43.3) and later CMA 6 Easy (79.5 vs 73) if either leaked in.
    assert o.exam_difficulty(20, "TMA", grp, means.combine_first(pd.Series({5: 10.0}))) == "Med"
    assert o.exam_difficulty(20, "TMA", grp, means.combine_first(pd.Series({6: 99.0}))) == "Med"
    assert o.exam_difficulty(20, "TMA", grp, means.combine_first(pd.Series({4: 0.0}))) == "Med"  # its own mean


def test_issue_169_exam_difficulty_mirrors_concept_difficulty():
    # Per type: covered class mean minus the mean of all earlier class means of that type; gaps averaged
    # across the types present; beyond +-5 points is Easy/Hard (extension/src/model/evidence.ts conceptDifficulty).
    grp = _grp([(1, "CMA", 1), (2, "TMA", 2), (3, "TMA", 10), (4, "CMA", 11), (5, "TMA", 12), (6, "TMA", 20)])
    m = {1: 80.0, 2: 70.0, 3: 70.0, 5: 70.0}
    # predicting 6: previous TMA is 5 at day 12, so nothing is covered: Med
    assert o.exam_difficulty(20, "TMA", grp, pd.Series(m | {4: 50.0})) == "Med"
    # predicting 5 (previous TMA at day 10): covered = item 4 (CMA). CMA gap = 4 - mean(1, 4)
    assert o.exam_difficulty(12, "TMA", grp, pd.Series(m | {4: 60.0})) == "Hard"  # 60 - 70 = -10
    assert o.exam_difficulty(12, "TMA", grp, pd.Series(m | {4: 70.0})) == "Med"  # 70 - 75 = -5, not beyond
    assert o.exam_difficulty(12, "TMA", grp, pd.Series(m | {4: 100.0})) == "Easy"  # 100 - 90 = +10
    # predicting TMA 6 (previous TMA 3): covered = CMA 4 and Exam 5. Gaps: CMA 60 - 70 = -10, Exam 76 - 74 = +2;
    # their average, -4, is Med
    grp2 = _grp([(1, "Exam", 0), (2, "CMA", 1), (3, "TMA", 3), (4, "CMA", 5), (5, "Exam", 6), (6, "TMA", 10)])
    m2 = pd.Series({1: 72.0, 2: 80.0, 3: 70.0, 4: 60.0, 5: 76.0})
    assert o.exam_difficulty(10, "TMA", grp2, m2) == "Med"
    assert o.exam_difficulty(10, "TMA", grp2, m2.drop(5)) == "Hard"  # only the CMA gap, -10, remains


def test_issue_169_covered_is_earlier_assessments_after_the_previous_one_of_its_type():
    grp = _grp([(1, "TMA", 10), (2, "CMA", 15), (3, "CMA", 18), (4, "TMA", 20), (5, "Exam", 30)])
    means = pd.Series({1: 90.0, 2: 40.0, 3: 50.0, 4: 90.0})
    # TMA 4: covered = CMAs 2 and 3 (after TMA 1), each CMA gap is (45 - 45) = 0: Med
    assert o.exam_difficulty(20, "TMA", grp, means) == "Med"
    # first assessment of its type (the exam): covered = all earlier, so every gap is 0: Med
    assert o.exam_difficulty(30, "Exam", grp, means) == "Med"
    # no earlier assessment with a class mean: Med
    assert o.exam_difficulty(10, "TMA", grp, means) == "Med"


def _with_difficulty_signal():
    """make(), with CMAs between TMAs and some CMAs much harder or easier, so labels are not all Med."""
    d = make()
    a = d["assessments"]
    a.loc[a.id_assessment % 10 % 2 == 0, "assessment_type"] = "CMA"  # ids 2,4,6,8 and 12,14,16,18
    sa = d["student_assessment"]
    sa.loc[sa.id_assessment.isin([4, 14]), "score"] -= 30
    sa.loc[sa.id_assessment.isin([8, 18]), "score"] += 30
    return d


def test_issue_169_changing_any_score_on_the_predicted_assessment_never_changes_its_exam_difficulty():
    base = o.build_tables(**_with_difficulty_signal())[1]
    assert set(base.exam_difficulty) - {"Med"}  # the fixture has signal to lose
    label = base.groupby("id_assessment").exam_difficulty.agg(lambda s: set(s))
    assert (label.map(len) == 1).all()  # one label per assessment
    for aid in label.index:
        for new in (0.0, 100.0):
            d = _with_difficulty_signal()
            d["student_assessment"].loc[d["student_assessment"].id_assessment == aid, "score"] = new
            got = o.build_tables(**d)[1]
            assert set(got[got.id_assessment == aid].exam_difficulty) == label[aid], (aid, new)
