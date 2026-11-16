import csv
import math
import random

import pytest
from bsp_eval.oulad_holdout import (
    PARENTS,
    TABLES,
    evaluate,
    load_rows,
    metrics,
    pick_resolution,
    sparse_cells,
    stress_holdout,
)

P = PARENTS["network"]
LV, TL, DF = ["Low", "Med", "High"], ["On time", "Some late", "Often late or missing"], ["Easy", "Med", "Hard"]


def _rows(n, standing, seed=0):
    rnd = random.Random(seed)
    return [{"id_student": str(i), "perf": rnd.choice(LV), "study": rnd.choice(LV), "timeliness": rnd.choice(TL),
             "exam_difficulty": rnd.choice(DF), "exam_standing": str(standing(rnd))} for i in range(n)]


def test_criterion_1_split_is_20_percent_by_student_never_by_row(tmp_path):
    split = TABLES / "oulad/oulad_split.csv"
    with split.open() as f:
        parts = list(csv.DictReader(f))
    assert abs(sum(r["split"] == "test" for r in parts) / len(parts) - 0.2) < 0.01
    data = tmp_path / "d.csv"
    data.write_text("id_student,exam_standing\n" + "".join(f"{r['id_student']},5.0\n" for r in parts[:50] for _ in range(3)))
    train, test = load_rows(data, split)
    assert not {r["id_student"] for r in train} & {r["id_student"] for r in test}
    assert len(train) + len(test) == 150


def test_criterion_1_log_loss_and_accuracy():
    m = metrics([[0.5, 0.5], [0.9, 0.1]], [0, 1])
    assert m["log_loss"] == pytest.approx(-(math.log(0.5) + math.log(0.1)) / 2)
    assert m["accuracy"] == 0.5
    assert metrics([[1.0, 0.0]], [1])["log_loss"] is None  # zero probability on the true outcome


def test_criterion_2_alpha_zero_fails_on_an_empty_cell_alpha_one_does_not():
    train, test = _rows(50, lambda r: 5), _rows(20, lambda r: 5, seed=1)
    assert "failed" in evaluate(train, test, P, 0)
    assert evaluate(train, test, P, 1)["log_loss"] > 0


def test_criterion_3_quintile_fallback_kept_when_it_scores_better():
    # the outcome is 1 or 2 at random: quintile 1 holds both, so the two-decile spread loses nothing
    # and deciles pay for sparse cells; with 9 parent cells of ~30 rows, sparse_cells > 0
    train, test = _rows(400, lambda r: r.choice([1, 2])), _rows(400, lambda r: r.choice([1, 2]), seed=3)
    assert sparse_cells(train, P) > 0
    r = pick_resolution(train, test, P)
    assert r["quintiles"] is not None and r["kept"] == "quintiles"


def test_criterion_3_no_quintiles_tried_when_no_cell_is_sparse():
    perf_only = {"perf": LV}  # 3 cells of ~100 rows each
    train = _rows(300, lambda r: r.randint(1, 10))
    assert pick_resolution(train, train[:50], perf_only)["quintiles"] is None


def test_criterion_4_load_alone_vs_overall_rate():
    z = {"Low": 0, "Med": 0, "High": 0}
    counts = {"levels": ["Low", "Med", "High"], "stress_now": {
        "train": {"Low": {**z, "Low": 9, "Med": 1}, "Med": {**z, "Med": 5}, "High": {**z, "High": 9, "Med": 1}},
        "test": {"Low": {**z, "Low": 4}, "Med": {**z, "Med": 4}, "High": {**z, "High": 4}}}}
    r = stress_holdout(counts)
    assert r["test_responses"] == 12 and r["load_alone_log_loss"] < r["overall_rate_log_loss"]
