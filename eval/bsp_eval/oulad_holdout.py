"""Held-out evaluation of the learned tables: 20% of OULAD students (split by student, fixed seed).

Research basis: held-out log-loss and accuracy (Hastie, Tibshirani & Friedman, The Elements of
Statistical Learning, ch. 7); add-alpha smoothing (Manning et al., Introduction to Information
Retrieval, ch. 13). Design: docs/design-v2.md (Evaluation, Learning the CPTs: sparse cells).
Run: python -m bsp_eval.oulad_holdout

The outcome is Exam standing (decile). Course history only conditions on Perf alone; the network
conditions on Perf, Study, Timeliness and Exam difficulty (every parent is observed, so its answer
is the learned table's row). The split is the committed oulad_split.csv, never by row.
"""

import csv
import json
import math
from pathlib import Path

from bsp_priors.fit import DECILES, cpt, smooth
from bsp_priors.ingest_oulad import DIFFICULTY, LEVELS, SEED, SPARSE, TIMELINESS

ROOT = Path(__file__).parents[2]
TABLES = ROOT / "priors/tables"
ALPHAS = (0, 1, 5)
SAMPLE = 200  # train rows for the empty-cell demo: far fewer than the 729 parent combinations
PARENTS = {
    "course_history_only": {"perf": LEVELS},
    "network": {"perf": LEVELS, "study": LEVELS, "timeliness": TIMELINESS, "exam_difficulty": DIFFICULTY},
}


def load_rows(path: Path, split_path: Path) -> tuple[list[dict], list[dict]]:
    """(train, test) rows of an OULAD CSV, partitioned by the student's split, standing as a decile string."""
    with split_path.open(newline="") as f:
        part = {r["id_student"]: r["split"] for r in csv.DictReader(f)}
    out: dict = {"train": [], "test": []}
    with path.open(newline="") as f:
        for r in csv.DictReader(f):
            r["exam_standing"] = str(int(float(r["exam_standing"])))
            out[part[r["id_student"]]].append(r)
    return out["train"], out["test"]


def metrics(probs: list[list[float]], truth: list[int]) -> dict:
    """Mean log-loss (nats; None if any true outcome has probability 0) and accuracy (ties go to the lower decile)."""
    zero = sum(p[t] == 0 for p, t in zip(probs, truth))
    loss = None if zero else -sum(math.log(p[t]) for p, t in zip(probs, truth)) / len(truth)
    hits = sum(max(range(len(p)), key=p.__getitem__) == t for p, t in zip(probs, truth))
    return {"log_loss": loss, "accuracy": hits / len(truth), "zero_probability_rows": zero, "n": len(truth)}


def _to_deciles(p: list[float]) -> list[float]:
    """A quintile distribution as a decile one, each quintile's mass split evenly over its two deciles."""
    return p if len(p) == 10 else [x / 2 for x in p for _ in (0, 1)]


def evaluate(train: list[dict], test: list[dict], parents: dict, alpha: float, quintiles: bool = False) -> dict:
    """Fit on train, score on test. alpha = 0 on an empty parent cell fails (0/0): reported, not hidden."""
    q = (lambda d: str((int(d) + 1) // 2)) if quintiles else str
    states = [str(i) for i in range(1, 6)] if quintiles else DECILES
    try:
        table = cpt([{**r, "exam_standing": q(r["exam_standing"])} for r in train], "exam_standing", states, parents, alpha)
    except ZeroDivisionError:
        return {"failed": "alpha = 0 and a parent cell is empty: 0/0", "log_loss": None, "accuracy": None}
    probs = [_to_deciles(table["values"]["|".join(r[p] for p in parents)]) for r in test]
    return metrics(probs, [int(r["exam_standing"]) - 1 for r in test])


def sparse_cells(train: list[dict], parents: dict, minimum: int = SPARSE) -> int:
    """Parent combinations (empty ones included) with fewer than `minimum` training rows."""
    n = cpt(train, "exam_standing", DECILES, parents)["values"]  # keys cover every combination
    counts: dict = {k: 0 for k in n}
    for r in train:
        counts["|".join(r[p] for p in parents)] += 1
    return sum(c < minimum for c in counts.values())


def pick_resolution(train: list[dict], test: list[dict], parents: dict, alpha: float = 1) -> dict:
    """If any parent cell is sparse, also try quintiles and keep the better held-out log-loss (deciles on a tie)."""
    deciles = evaluate(train, test, parents, alpha)
    out = {"sparse_cells": sparse_cells(train, parents), "deciles": deciles, "quintiles": None, "kept": "deciles"}
    if out["sparse_cells"]:
        out["quintiles"] = evaluate(train, test, parents, alpha, quintiles=True)
        if out["quintiles"]["log_loss"] < deciles["log_loss"]:
            out["kept"] = "quintiles"
    return out


def stress_holdout(counts: dict) -> dict:
    """StudentLife (already split by student): Load alone vs guessing the overall train rate, on the test split."""
    levels = counts["levels"]
    tr, te = counts["stress_now"]["train"], counts["stress_now"]["test"]
    totals = {s: sum(tr[ld][s] for ld in levels) for s in levels}
    overall = smooth(totals, levels)
    n = sum(te[ld][s] for ld in levels for s in levels)
    by_load = {ld: smooth(tr[ld], levels) for ld in levels}

    def loss(dist) -> float:
        return -sum(te[ld][s] * math.log(dist(ld)[i]) for ld in levels for i, s in enumerate(levels)) / n

    return {"test_responses": n, "load_alone_log_loss": loss(by_load.__getitem__),
            "overall_rate_log_loss": loss(lambda _: overall)}


def run(tables: Path = TABLES) -> dict:
    o = tables / "oulad"
    train, test = load_rows(o / "oulad_exam_standing.csv", o / "oulad_split.csv")
    students = {s: len({r["id_student"] for r in rows}) for s, rows in (("train", train), ("test", test))}
    return {
        "seed": SEED, "outcome": "exam_standing decile",
        "students": students, "rows": {"train": len(train), "test": len(test)},
        "test_student_share": students["test"] / sum(students.values()),
        "models_alpha_1": {m: evaluate(train, test, p, 1) for m, p in PARENTS.items()},
        "alpha": {m: {str(a): evaluate(train, test, p, a) for a in ALPHAS} for m, p in PARENTS.items()},
        # the full train set has no empty cell, so show the failure on a small sample where cells are empty
        "alpha_0_empty_cell_demo": {str(a): evaluate(train[:SAMPLE], test, PARENTS["network"], a) for a in (0, 1)},
        "network_resolution": pick_resolution(train, test, PARENTS["network"]),
        "studentlife": stress_holdout(json.loads((tables / "studentlife/stress_counts.json").read_text())),
    }


def write(out: Path = ROOT / "eval/results/oulad_holdout.json", tables: Path = TABLES) -> dict:
    result = run(tables)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    write()
