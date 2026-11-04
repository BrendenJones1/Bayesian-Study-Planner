"""Learn the Laplace-smoothed CPTs from the committed tables and write cpts.json.

Research basis: Laplace (add-alpha) smoothing, P(x|u) = (N(x,u) + a) / (N(u) + a|X|) (Manning,
Raghavan & Schutze, Introduction to Information Retrieval, ch. 13); counting CPTs for discrete
Bayesian networks (Koller & Friedman, Probabilistic Graphical Models, ch. 17). Class standing links
OULAD to UBC by percentile (Kolen & Brennan, Test Equating, Scaling, and Linking).
Design: docs/design-v2.md (Learning the CPTs, Prediction). Inputs are committed files only.
"""

import argparse
import csv
import itertools
import json
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

from bsp_priors.ingest_oulad import DIFFICULTY, LEVELS, TIMELINESS, WEIGHT_CUT
from bsp_priors.ingest_ubcgrades import BINS, _p_in_decile, difficulty, read_csv

ALPHA = 1.0
MODEL_VERSION = "2.0.0"
TABLES = Path(__file__).resolve().parents[1] / "tables"
DECILES = [str(d) for d in range(1, 11)]
WEIGHTS = ["<=15%", ">15%"]
TARGETS = [e for e in BINS.values() if e >= 50]  # letter boundaries 50 ... 90
# Assumed (design-v2 Assumptions): study volume cuts in hours per course per week, middle third around 3 h.
STUDY_VOLUME_HOURS = {"low_max": 2.0, "med_max": 4.0}
# Volume level + active-day level (each 0, 1, 2) summed: 0-1 Low, 2 Med, 3-4 High (design-v2, Prediction).
STUDY_LEVEL_SUM = {"Low": [0, 1], "Med": [2], "High": [3, 4]}


def smooth(counts: Counter, states: list[str], alpha: float = ALPHA) -> list[float]:
    """(N(x,u) + alpha) / (N(u) + alpha * |X|) for each state x; counts holds N(x,u) for one parent row.

    alpha = 0 on a parent row with no data divides by zero, so it raises.
    """
    n = sum(counts[x] for x in states)
    return [(counts[x] + alpha) / (n + alpha * len(states)) for x in states]


def cpt(rows: list[dict], child: str, states: list[str], parents: dict[str, list[str]],
        alpha: float = ALPHA) -> dict:
    """One table: every parent combination (in product order), keyed 'a|b|c', maps to P(child)."""
    counts: dict = defaultdict(Counter)
    for r in rows:
        counts[tuple(r[p] for p in parents)][r[child]] += 1
    values = {"|".join(u): smooth(counts[u], states, alpha) for u in itertools.product(*parents.values())}
    return {"parents": parents, "states": states, "values": values}


def _decile(v: str) -> str:
    return str(int(float(v)))  # the CSVs write standings as 10.0


def _read(path: Path, split: dict[str, str] | None, which: str, decile_cols=("exam_standing", "final_standing")):
    with path.open(newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if split is None or split[r["id_student"]] == which]
    for r in rows:
        for c in decile_cols:
            if c in r:
                r[c] = _decile(r[c])
    return rows


def _stress_cpt(counts: dict, parents: dict[str, list[str]], alpha: float) -> dict:
    """Stress table from aggregate counts[parent...][child]; the parent keys are the nested dict levels."""
    values = {}
    for u in itertools.product(*parents.values()):
        node = counts
        for k in u:
            node = node[k]
        values["|".join(u)] = smooth(Counter(node), LEVELS, alpha)
    return {"parents": parents, "states": LEVELS, "values": values}


def grade_map_table(bins: list[dict]) -> dict:
    """P(grade >= target | decile, course), the UBC grade map as built by ingest_ubcgrades.grade_map.

    Same rule as grade_map (each year sliced separately then averaged; under 2 years use the pooled
    difficulty group) but pooled once, not per call. No smoothing: these are exact slices.
    """
    by_year: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    avgs: dict = {}
    for r in bins:
        by_year[r["course"]][r["year"]][r["bin"]] += r["students"]
        avgs[(r["course"], r["year"])] = r["avg"]
    pooled: dict = defaultdict(lambda: defaultdict(int))
    for course, years in by_year.items():
        for year, dist in years.items():
            for b, n in dist.items():
                pooled[difficulty(avgs[(course, year)])][b] += n
    courses = {}
    for course, years in by_year.items():
        dists = list(years.values())
        if len(dists) < 2:
            dists = [pooled[difficulty(avgs[(course, next(iter(years)))])]]
        courses[course] = {
            str(t): [sum(_p_in_decile(d, t, k) for d in dists) / len(dists) for k in range(1, 11)]
            for t in TARGETS
        }
    return {"parents": {"final_standing": DECILES, "course": sorted(courses)}, "targets": TARGETS,
            "states": "P(grade >= target); courses[course][target] has one value per decile 1..10",
            "courses": courses}


def build(split: str = "train", alpha: float = ALPHA, tables: Path = TABLES, built_at: str | None = None) -> dict:
    """Assemble cpts.json from the committed tables. split is 'train' or 'test' (default train)."""
    o, s = tables / "oulad", tables / "studentlife"
    with (o / "oulad_split.csv").open(newline="") as f:
        sp = {r["id_student"]: r["split"] for r in csv.DictReader(f)}
    cuts = json.loads((o / "oulad_study_cuts.json").read_text())["active_day_share"]
    stress = json.loads((s / "stress_counts.json").read_text())
    load = json.loads((s / "load_cuts.json").read_text())
    perf = {"perf": LEVELS}
    cpts = {
        "study": cpt(_read(o / "oulad_study.csv", sp, split), "study", LEVELS, perf, alpha),
        "exam_standing": cpt(
            _read(o / "oulad_exam_standing.csv", sp, split), "exam_standing", DECILES,
            {**perf, "study": LEVELS, "timeliness": TIMELINESS, "exam_difficulty": DIFFICULTY}, alpha),
        "stress_now": _stress_cpt(stress["stress_now"][split], {"load": LEVELS}, alpha),
        "stress_next": _stress_cpt(stress["stress_next"][split], {"stress_now": LEVELS, "load_tomorrow": LEVELS}, alpha),
    }
    for g in (25, 50):
        cpts[f"final_standing_g{g}"] = cpt(
            _read(o / f"oulad_final_standing_g{g}.csv", sp, split), "final_standing", DECILES,
            {**perf, "exam_standing": DECILES, "item_weight": WEIGHTS}, alpha)
    cpts["grade_map"] = grade_map_table(read_csv(tables / "ubc_grade_bins.csv"))
    return {
        "model_version": MODEL_VERSION,
        "built_at": built_at or datetime.now(UTC).isoformat(timespec="seconds"),
        "alpha": alpha,
        "split": split,
        "cut_points": {
            "timeliness": {"states": TIMELINESS, "rule": "share of earlier items late or missing: 0 On time, <= 1/3 Some late, else Often late or missing"},
            "study_volume_hours_per_course_week": STUDY_VOLUME_HOURS,
            "study_active_day_share": cuts,
            "study_level_sum": STUDY_LEVEL_SUM,
            "load_deadlines_next_3_days": load,
            "item_weight_share_of_final_grade": WEIGHT_CUT,
        },
        "tables": cpts,
    }


if __name__ == "__main__":  # python -m bsp_priors.fit [--split train] [--out priors/tables/cpts.json]
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="train", choices=["train", "test"])
    ap.add_argument("--out", type=Path, default=TABLES / "cpts.json")
    a = ap.parse_args()
    a.out.write_text(json.dumps(build(a.split), separators=(",", ":")) + "\n")
