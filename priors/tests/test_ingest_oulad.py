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
    study, exam, finals, split = o.build_tables(**make())
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
