import json
import math
import tomllib
from pathlib import Path

import pytest
from bsp_eval.network import STRESS_SCORE, TARGETS, answer, build_network, load_cpts
from bsp_priors.hand_built import _mean_table, hand_built
from bsp_priors.ingest_oulad import DIFFICULTY, LEVELS
from pgmpy.inference import VariableElimination

EVAL = Path(__file__).parents[1]
CPTS = EVAL.parent / "priors" / "tables" / "cpts.json"
COURSE = "MATH 100"
EV = {"M1": "High", "M2": "Med", "M3": "Med", "D1": "Hard", "D2": "Med", "D3": "Med", "Timeliness": "On time",
      "DaysLeft": "3-7", "GradedSoFar": 25, "ItemWeight": ">15%", "LoadToday": "Med", "LoadTomorrow": "High"}


@pytest.fixture(scope="module")
def cpts():
    return load_cpts(CPTS)


def toy(cpts):
    """The same tables with 2 concepts instead of 3."""
    h = hand_built()
    h["exam_difficulty"] = _mean_table("Exam difficulty", DIFFICULTY, ["d1", "d2"])
    h["perf"] = _mean_table("Perf", LEVELS, ["m1", "m2"])
    return {**cpts, "hand_built": h}


def test_criterion_1_builds_23_nodes_from_cpts_json(cpts):
    assert len(build_network(cpts, COURSE, 80).nodes()) == 23
    assert len(build_network(toy(cpts), COURSE, 80).nodes()) == 21  # 2 concepts: one D and one M fewer


def test_criterion_1_no_probabilities_typed_into_code(cpts):
    """Replacing a table in the data changes the answer, so the numbers come from cpts.json."""
    bent = json.loads(json.dumps(cpts))
    bent["tables"]["grade_map"]["courses"][COURSE]["80"] = [0.5] * 10
    assert answer(bent, COURSE, EV, "Light", [80])["p_grade"][80] == pytest.approx(0.5)
    assert answer(cpts, COURSE, EV, "Light", [80])["p_grade"][80] != pytest.approx(0.5)


def test_criterion_2_answers_every_ubc_boundary(cpts):
    r = answer(cpts, COURSE, EV, "Intense")
    assert list(r["p_grade"]) == TARGETS == [50, 55, 60, 64, 68, 72, 76, 80, 85, 90]
    ps = list(r["p_grade"].values())
    assert all(0 <= p <= 1 for p in ps)
    assert ps == sorted(ps, reverse=True)  # a higher bar is never easier
    assert 0 <= r["e_stress_next"] <= 1


def test_criterion_3_notebook_only_calls_the_function():
    nb = json.loads((EVAL / "notebooks" / "network_queries.ipynb").read_text())
    code = "".join("".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code")
    assert "from bsp_eval.network import" in code and "answer(" in code
    assert "pgmpy" not in code and "TabularCPD" not in code


def test_criterion_4_answers_sum_to_one_and_match_hand_enumeration_on_2_concept_toy(cpts):
    c = toy(cpts)
    t, h = c["tables"], c["hand_built"]
    ev = {k: v for k, v in EV.items() if k not in ("M3", "D3")}
    action, target = "Light", 80

    def row(tab, key):
        return tab["values"][key]

    def one(tab, key):  # hand-built rows are one-hot
        return tab["states"][row(tab, key).index(1.0)]

    perf = one(h["perf"], "High|Med")
    diff = one(h["exam_difficulty"], "Hard|Med")
    g = t["grade_map"]["courses"][COURSE][str(target)]
    p_grade = 0.0
    for si, ps in enumerate(row(t["study"], perf)):
        sb = one(h["study_before"], f"{LEVELS[si]}|{action}|3-7")
        for xi, px in enumerate(row(t["exam_standing"], f"{perf}|{sb}|On time|{diff}")):
            # offset 0, checkpoint 25: Final standing | Perf, exam decile, weight
            for fi, pf in enumerate(row(t["final_standing_g25"], f"{perf}|{xi + 1}|>15%")):
                p_grade += ps * px * pf * g[fi]
    e_stress = sum(
        pn * pnext * STRESS_SCORE[LEVELS[ki]]
        for ni, pn in enumerate(row(t["stress_now"], "Med"))
        for ki, pnext in enumerate(row(t["stress_next"], f"{LEVELS[ni]}|High")))
    r = answer(c, COURSE, ev, action, [target])
    assert r["p_grade"][target] == pytest.approx(p_grade)
    assert r["e_stress_next"] == pytest.approx(e_stress)
    ve = VariableElimination(build_network(c, COURSE, target))
    for var in ("Grade", "StressNext", "ExamStanding", "FinalStanding"):
        f = ve.query([var], {**ev, "Action": action, "PersonalOffset": 0}, show_progress=False)
        assert math.isclose(f.values.sum(), 1.0)


def test_criterion_5_pgmpy_is_an_eval_dependency():
    deps = tomllib.loads((EVAL / "pyproject.toml").read_text())["project"]["dependencies"]
    assert any(d.startswith("pgmpy") for d in deps)
