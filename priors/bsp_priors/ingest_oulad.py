"""Build the OULAD CSVs for the learned tables (docs/design-v2.md, Learning the CPTs).

Research basis: thirds and deciles are percentile ranks within a class, the quantity that
transfers to UBC through equipercentile linking (Kolen & Brennan, Test Equating, Scaling,
and Linking). Rules: no leakage (Perf, Study and Timeliness use only data dated before the
assessment), ranks within each module presentation, withdrawals excluded, item weight as
share of the final grade within the module, 80/20 split by student.

Also writes oulad_study_cuts.json: thirds of the active-day share (train students), used for the
Study-before-the-exam rule (design-v2, Prediction).

Run: python -m bsp_priors.ingest_oulad --raw <OULAD csv dir> --out <output dir>
"""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import pandas as pd

PRES = ["code_module", "code_presentation"]
LEVELS = ["Low", "Med", "High"]
TIMELINESS = ["On time", "Some late", "Often late or missing"]
DIFFICULTY = ["Easy", "Med", "Hard"]
SOME_LATE_MAX = 1 / 3  # Timeliness: share of earlier items late or missing; <= this is Some late (also written to cpts.json)
WEIGHT_CUT = 0.15  # assumed (design-v2 Assumptions): share of the final grade
DIFFICULTY_CUT = 5.0  # assumed: points from the mean of earlier class means
SPARSE = 30
CHECKPOINTS = (25, 50)  # share of the final grade graded before the assessment; no OULAD module has 75%
# graded before its final exam (about half the grade), so a 75% table would have no rows (design-v2, Network)
SEED = 0

ATTRIBUTION = """# OULAD-derived CSVs

Source: Open University Learning Analytics Dataset (OULAD),
https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset
Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
Modified: aggregated and discretised (thirds, deciles and buckets within each module
presentation; no raw scores or click counts are kept).

Cite both:
- Kuzilek J., Hlosta M., Zdrahal Z. Open University Learning Analytics dataset.
  Sci. Data 4:170171, doi: 10.1038/sdata.2017.171 (2017).
- Kuzilek, J., Hlosta, M., & Zdrahal, Z. (2015). Open University Learning Analytics
  dataset [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5KK69.
"""


def bucket(values: pd.Series, k: int) -> pd.Series:
    """Class-relative bucket 1..k from the mid-rank percentile (ties share a bucket)."""
    pct = (values.rank(method="average") - 0.5) / values.count()
    return (pct * k).astype(int).clip(upper=k - 1) + 1


def label(b: pd.Series, names: list[str]) -> pd.Series:
    return (b - 1).map(dict(enumerate(names)))


def split_students(ids, seed: int = SEED, test_frac: float = 0.2) -> pd.DataFrame:
    """80/20 split by student (never by row), fixed seed."""
    ids = sorted(set(ids))
    shuffled = ids.copy()
    random.Random(seed).shuffle(shuffled)
    test = set(shuffled[: round(len(ids) * test_frac)])
    return pd.DataFrame({"id_student": ids, "split": ["test" if i in test else "train" for i in ids]})


def active_share(clicks: pd.DataFrame, students: pd.Index, date: float) -> pd.Series:
    """Share of the days from the start of the presentation up to `date` on which each student had a click."""
    window = clicks[(clicks.date >= 0) & (clicks.date < date)]
    return window.groupby("id_student").date.nunique().reindex(students).fillna(0) / max(date, 1)


def _features(a, grp, sa, clicks, students, prev_mean):
    """Perf, Study, Timeliness and difficulty for one assessment, from dates before a.date."""
    prior = grp[grp.date < a.date]
    sp = sa[sa.id_assessment.isin(prior.id_assessment)]
    w = sp.weight + 1e-9  # a zero-weight item still counts if it is all there is
    perf = (sp.score * w).groupby(sp.id_student).sum() / w.groupby(sp.id_student).sum()
    late = (sp.date_submitted > sp.date).groupby(sp.id_student).sum()
    missing = len(prior) - sp.groupby("id_student").size()
    frac = (late + missing).reindex(students).fillna(len(prior)) / len(prior)
    clk = clicks[clicks.date < a.date].groupby("id_student").sum_click.sum()
    study = bucket(clk.reindex(students).fillna(0), 3)
    tl = pd.Series(np.select([frac == 0, frac <= SOME_LATE_MAX], [1, 2], 3), frac.index)
    diff = sa[sa.id_assessment == a.id_assessment].score.mean() - prev_mean
    d = 1 if diff > DIFFICULTY_CUT else (3 if diff < -DIFFICULTY_CUT else 2)
    return pd.DataFrame(
        {
            "id_student": perf.index,
            "perf": label(bucket(perf, 3), LEVELS).values,
            "study": label(study.reindex(perf.index), LEVELS).values,
            "timeliness": label(tl.reindex(perf.index), TIMELINESS).values,
            "exam_difficulty": DIFFICULTY[d - 1],
            "active_share": active_share(clicks, students, a.date).reindex(perf.index).values,
        }
    )


def build_tables(info, courses, assessments, student_assessment, student_vle):
    """Return (study, exam_standing, {g: final_standing}, split, study_cuts).

    study_cuts are thirds of the active-day share over train-split students (all assessments pooled),
    the absolute values the extension compares a student's own active days against.
    """
    info = info[info.final_result != "Withdrawn"]
    ass = assessments.merge(courses[[*PRES, "module_presentation_length"]], on=PRES)
    ass["date"] = ass.date.fillna(ass.module_presentation_length)
    ass["share"] = ass.weight / ass.groupby(PRES).weight.transform("sum")
    sa = student_assessment.merge(
        ass[["id_assessment", *PRES, "date", "weight"]], on="id_assessment"
    ).merge(info[[*PRES, "id_student"]], on=[*PRES, "id_student"])  # inner: drops withdrawn
    sa = sa.dropna(subset=["score"])
    daily = student_vle.groupby([*PRES, "id_student", "date"], as_index=False).sum_click.sum()

    rows, checks = [], {g: [] for g in CHECKPOINTS}
    for (m, p), grp in ass.sort_values(["date", "id_assessment"]).groupby(PRES):
        students = pd.Index(info[(info.code_module == m) & (info.code_presentation == p)].id_student)
        sa_p = sa[(sa.code_module == m) & (sa.code_presentation == p)]
        cl_p = daily[(daily.code_module == m) & (daily.code_presentation == p)]
        means = sa_p.groupby("id_assessment").score.mean()
        total = (sa_p.score * sa_p.weight).groupby(sa_p.id_student).sum()
        final = bucket(total.reindex(students).fillna(0) / grp.weight.sum(), 10)
        prior_share = grp.share.cumsum() - grp.share
        taken = set()
        for a in grp.itertuples():
            prior = grp[grp.date < a.date].id_assessment.map(means).dropna()
            if prior.empty:
                continue
            f = _features(a, grp, sa_p, cl_p, students, prior.mean())
            sc = sa_p[sa_p.id_assessment == a.id_assessment].set_index("id_student").score
            f["has_score"] = f.id_student.isin(sc.index)
            f["exam_standing"] = bucket(sc, 10).reindex(f.id_student).values
            f["final_standing"] = f.id_student.map(final)
            f["item_weight"] = "<=15%" if a.share <= WEIGHT_CUT else ">15%"
            f["code_module"], f["code_presentation"], f["id_assessment"] = m, p, a.id_assessment
            rows.append(f)
            for g in CHECKPOINTS:
                if g not in taken and prior_share[a.Index] >= g / 100 - 1e-9:
                    taken.add(g)
                    checks[g].append(f)
    key = [*PRES, "id_assessment", "id_student"]
    long = pd.concat(rows, ignore_index=True)
    study = long[[*key, "perf", "study"]]
    exam = long[long.has_score][[*key, "perf", "study", "timeliness", "exam_difficulty", "exam_standing"]]
    fcols = [*PRES, "id_student", "perf", "exam_standing", "item_weight", "final_standing"]
    finals = {  # a checkpoint no presentation reaches gives an empty table
        g: pd.concat(c, ignore_index=True).query("has_score")[fcols]
        if c
        else pd.DataFrame(columns=fcols)
        for g, c in checks.items()
    }
    split = split_students(info.id_student)
    train = long[long.id_student.isin(split[split.split == "train"].id_student)].active_share
    low, med = (float(x) for x in np.quantile(train, [1 / 3, 2 / 3]))
    return study, exam, finals, split, {"low_max": low, "med_max": med}


def cell_report(exam: pd.DataFrame, split: pd.DataFrame) -> pd.DataFrame:
    """Training students per Exam-standing parent cell (all 81), flagging cells under 30."""
    train = exam.merge(split[split.split == "train"], on="id_student")
    parents = ["perf", "study", "timeliness", "exam_difficulty"]
    n = train.groupby(parents).id_student.nunique()
    full = pd.MultiIndex.from_product([LEVELS, LEVELS, TIMELINESS, DIFFICULTY], names=parents)
    rep = n.reindex(full, fill_value=0).rename("n_students").reset_index()
    rep["sparse"] = rep.n_students < SPARSE
    return rep


def sparse_summary(rep: pd.DataFrame) -> str:
    """One line for the build log: how many Exam-standing parent cells are under SPARSE students."""
    return f"{int(rep['sparse'].sum())} of {len(rep)} Exam-standing cells under {SPARSE} students"


def write_all(raw: Path, out: Path) -> pd.DataFrame:
    """Read the OULAD files in raw/, write the CSVs, split and README; return the cell report."""
    study, exam, finals, split, study_cuts = build_tables(
        *(pd.read_csv(raw / f"{n}.csv")
          for n in ("studentInfo", "courses", "assessments", "studentAssessment", "studentVle"))
    )
    out.mkdir(parents=True, exist_ok=True)
    exam.to_csv(out / "oulad_exam_standing.csv", index=False)
    for g, df in finals.items():
        df.to_csv(out / f"oulad_final_standing_g{g}.csv", index=False)
    study.to_csv(out / "oulad_study.csv", index=False)
    split.to_csv(out / "oulad_split.csv", index=False)
    (out / "oulad_study_cuts.json").write_text(json.dumps({
        "active_day_share": study_cuts,
        "definition": "share of days from the start of the presentation to the assessment with any VLE click; "
                      "Low if <= low_max, Med if <= med_max, else High; thirds over train students, all assessments pooled",
    }, indent=1))
    (out / "README.md").write_text(ATTRIBUTION)
    return cell_report(exam, split)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("priors/data"))
    args = ap.parse_args()
    rep = write_all(args.raw, args.out)
    print(rep.to_string(index=False))
    print(sparse_summary(rep))
