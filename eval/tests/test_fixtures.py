import json
from pathlib import Path

import pytest
from bsp_eval.network import answer, load_cpts, stress_curve

ROOT = Path(__file__).parents[2]
FX = json.loads((ROOT / "shared" / "fixtures" / "inference.json").read_text())
CPTS = load_cpts(ROOT / FX["cpts"])


def test_criterion_2_fixtures_are_what_pgmpy_answers_now():
    """The committed fixtures equal a fresh pgmpy run, so eval/make_fixtures.py and the data cannot drift."""
    for q in FX["queries"]:
        r = answer(CPTS, q["course"], q["evidence"], q["action"])
        assert r["e_stress_next"] == pytest.approx(q["e_stress_next"], abs=1e-9), q["name"]
        for t, p in r["p_grade"].items():
            assert p == pytest.approx(q["p_grade"][str(t)], abs=1e-9), (q["name"], t)


def test_stress_curve_fixtures_are_what_pgmpy_answers_now():
    for c in FX["stress_curves"]:
        got = stress_curve(CPTS, c["load_today"], c["load_tomorrow"], c["hours"], c.get("theta", 0.2), c.get("stress_now"))
        assert got == pytest.approx(c["curve"], abs=1e-9), c["name"]


def test_criterion_4_fixtures_cover_the_required_cases():
    names = [q["name"] for q in FX["queries"]]
    assert any(n.startswith("no graded items") for n in names)
    assert any(n.startswith("hidden class statistics") for n in names)
    assert {q["action"] for q in FX["queries"]} == {"Intense", "Light", "Rest"}
    assert all({"50", "90"} <= set(q["p_grade"]) for q in FX["queries"])
    assert len(FX["queries"]) == 21
