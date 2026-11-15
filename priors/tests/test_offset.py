import json
import math
from collections import Counter

import pytest
from bsp_priors import fit, offset
from bsp_priors.offset import STATES


@pytest.fixture(scope="module")
def built():
    return fit.build(built_at="2026-01-01T00:00:00+00:00")


# A baseline whose most likely decile is 5 for every parent row.
def _cpt():
    row = [0.0] * 10
    row[4] = 1.0
    return {"values": {"Med|Med|On time|Med": row}}


def _row(student, assessment, decile, module="AAA", pres="2013J"):
    return {"id_student": student, "code_module": module, "code_presentation": pres,
            "id_assessment": str(assessment), "perf": "Med", "study": "Med", "timeliness": "On time",
            "exam_difficulty": "Med", "exam_standing": str(decile)}


def test_criterion_1_p0_is_counted_residual_share_with_laplace():
    rows = [_row("a", 1, 5), _row("a", 2, 9), _row("a", 3, 1), _row("a", 4, 6)]  # residuals 0, +2 (clipped), -2 (clipped), +1
    p0 = offset.p0_table(offset.sequences(rows, _cpt()))
    assert p0 == pytest.approx([2 / 9, 1 / 9, 2 / 9, 2 / 9, 2 / 9])  # (n + 1) / (4 + 5)
    assert sum(p0) == pytest.approx(1) and min(p0) > 0


def test_criterion_2_back_test_scores_every_m_on_later_items_of_students_with_four_or_more():
    rows = [_row("a", i, 5) for i in range(1, 5)] + [_row("b", i, 5) for i in range(1, 4)]  # b has only 3 items
    items = offset._later_items(offset.sequences(rows, _cpt()))
    assert len(items) == 3  # items 2..4 of student a, none of b
    assert items[0][0] == Counter({0: 1})  # item 2 sees only item 1 (date order)
    assert offset.M_GRID == [1, 2, 5, 10, 20, 50]


def test_criterion_3_lowest_log_loss_m_and_p0_are_in_cpts_json(built):
    o = json.loads(json.dumps(built))["offset"]
    by_m = o["backtest"]["logloss_by_m"]
    assert set(by_m) == {"1", "2", "5", "10", "20", "50"}
    assert by_m[str(o["m"])] == min(by_m.values())
    assert o["states"] == STATES and sum(o["p0"]) == pytest.approx(1) and min(o["p0"]) > 0


def test_criterion_4_reports_whether_offsets_carry_across_modules(built):
    cm = built["offset"]["backtest"]["cross_module"]
    assert cm["items"] > 0 and isinstance(cm["carries"], bool)
    assert cm["carries"] == (cm["logloss_with_other_module_counts"] < cm["logloss_p0_only"])


def test_criterion_4_carry_is_true_when_a_module_repeats_the_same_offset():
    rows = [_row("a", i, 9, "AAA", "2013J") for i in range(1, 5)]  # always +2
    rows += [_row("a", i, 9, "BBB", "2014B") for i in range(1, 5)]
    rows += [_row("z", i, 5, "AAA", "2013J") for i in range(1, 30)]  # keeps p0 from being all +2
    seqs = offset.sequences(rows, _cpt())
    assert offset.cross_module(seqs, offset.p0_table(seqs), 1)["carries"] is True


def test_criterion_5_residuals_use_the_baseline_only_never_the_offset_model():
    # The only inputs to a residual are the row and the baseline CPT; changing m or p0 cannot move it.
    rows = [_row("a", i, d) for i, d in enumerate([8, 5, 3, 5], 1)]
    expected = [2, 0, -2, 0]
    assert offset.sequences(rows, _cpt())[("a", "AAA", "2013J")] == expected
    assert list(offset.sequences.__code__.co_varnames[: offset.sequences.__code__.co_argcount]) == ["rows", "exam_cpt"]
    assert list(offset.baseline_mode.__code__.co_varnames[:2]) == ["exam_cpt", "row"]
    # a prediction from the offset model would shift the residual; the baseline's does not depend on counts
    assert offset.residual(7, offset.baseline_mode(_cpt(), rows[0])) == 2


def test_criterion_6_held_out_students_are_excluded_when_choosing_m(built):
    import csv

    with (fit.TABLES / "oulad" / "oulad_split.csv").open() as f:
        split = {r["id_student"]: r["split"] for r in csv.DictReader(f)}
    train = fit._read(fit.TABLES / "oulad" / "oulad_exam_standing.csv", split, "train")
    assert train and all(split[r["id_student"]] == "train" for r in train)
    # build(split="test") still learns the offset from train students only
    assert fit.build(split="test", built_at="x")["offset"] == built["offset"]


def test_p_offset_formula():
    p = offset.p_offset([0.2] * 5, Counter({2: 3}), 2)
    assert p[4] == pytest.approx((2 * 0.2 + 3) / 5) and sum(p) == pytest.approx(1)
    assert not math.isnan(sum(p))
