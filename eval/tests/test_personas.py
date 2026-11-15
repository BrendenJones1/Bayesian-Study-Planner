import itertools
from pathlib import Path

import pytest
from bsp_eval.network import load_cpts
from bsp_eval.personas import (
    DIFFICULTIES,
    LAMBDAS,
    PERSONAS,
    THETAS,
    difficulty_changes_action,
    plan_table,
)

CPTS = Path(__file__).parents[2] / "priors" / "tables" / "cpts.json"


@pytest.fixture(scope="module")
def rows():
    return plan_table(load_cpts(CPTS))


def test_four_personas_are_defined_as_evidence_sets():
    assert list(PERSONAS) == ["struggling", "advanced", "overloaded", "far from the exam"]
    assert all(p["courses"] for p in PERSONAS.values())


def test_table_has_no_missing_cell(rows):
    want = set(itertools.product(PERSONAS, DIFFICULTIES, LAMBDAS, THETAS))
    assert {(r["persona"], r["difficulty"], r["lambda"], r["theta"]) for r in rows} == want
    assert len(rows) == len(want) and all(r["plan"] for r in rows)


def test_theta_and_lambda_grids_match_the_design():
    assert THETAS == [0, 0.1, 0.2, 0.3] and list(LAMBDAS.values()) == [0.1, 0.4, 1.0]


def test_difficulty_can_change_the_chosen_action(rows):
    assert difficulty_changes_action(rows) is True
    assert difficulty_changes_action([{"persona": "a", "lambda": "x", "theta": 0, "plan": ("Rest",)}] * 3) is False
