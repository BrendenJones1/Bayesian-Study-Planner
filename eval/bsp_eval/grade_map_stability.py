"""Grade-map stability holdout: do difficulty labels from 2021-23 predict 2024-25 outcomes?

Research basis: temporal holdout (train on earlier years, test on later ones), as in
Hastie, Tibshirani & Friedman, The Elements of Statistical Learning, ch. 7.
Design: docs/design-v2.md (Evaluation). Run: python -m bsp_eval.grade_map_stability
"""

import json
import statistics
from collections import defaultdict
from pathlib import Path

from bsp_priors.ingest_ubcgrades import BINS, difficulty, read_csv

EARLY, LATE = range(2021, 2024), range(2024, 2026)
TARGET = 80
ROOT = Path(__file__).parents[2]


def stability(rows: list[dict]) -> dict:
    n_by: dict = defaultdict(lambda: defaultdict(int))  # (course, year) -> bin -> students
    avg: dict = {}
    for r in rows:
        n_by[(r["course"], r["year"])][r["bin"]] += r["students"]
        avg[(r["course"], r["year"])] = r["avg"]
    early: dict = defaultdict(list)
    for (c, y), a in avg.items():
        if y in EARLY:
            early[c].append(a)
    group = {c: difficulty(statistics.mean(a)) for c, a in early.items() if len(a) >= 2}
    few = sorted(c for c, a in early.items() if len(a) < 2)
    hit: dict = defaultdict(int)
    tot: dict = defaultdict(int)
    for (c, y), dist in n_by.items():
        if y in LATE and c in group:
            tot[group[c]] += sum(dist.values())
            hit[group[c]] += sum(n for b, n in dist.items() if BINS[b] >= TARGET)
    # Successive-year pairs of a course's average, over every year in the data.
    pairs = [(avg[(c, y)], avg[(c, y + 1)]) for (c, y) in avg if (c, y + 1) in avg]
    corr = statistics.correlation(*zip(*pairs)) if len(pairs) >= 3 else None
    return {
        "target": TARGET, "difficulty_years": [min(EARLY), max(EARLY)], "outcome_years": [min(LATE), max(LATE)],
        "p_at_or_above_target": {g: (hit[g] / tot[g] if tot[g] else None) for g in ("Easy", "Medium", "Hard")},
        "students": {g: tot[g] for g in ("Easy", "Medium", "Hard")},
        "successive_year_average_correlation": corr, "successive_year_pairs": len(pairs),
        "courses_under_2_early_years": few,
    }


def write(out: Path = ROOT / "eval/results/grade_map_stability.json",
          bins: Path = ROOT / "priors/tables/ubc_grade_bins.csv") -> dict:
    result = stability(read_csv(bins))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    write()
