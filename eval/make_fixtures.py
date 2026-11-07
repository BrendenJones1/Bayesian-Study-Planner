"""Writes shared/fixtures/inference.json: queries and the pgmpy answers the TypeScript enumeration must match.

Run from the repo root after any change to a CPT, the network structure or the offset formula:
    python eval/make_fixtures.py
Research basis: pgmpy VariableElimination is the reference (Koller & Friedman, PGM, ch. 9).
"""

import json
from pathlib import Path

from bsp_eval.network import answer, load_cpts, stress_curve

ROOT = Path(__file__).parents[1]
FULL = {"M1": "High", "M2": "Med", "M3": "Med", "D1": "Hard", "D2": "Med", "D3": "Med", "Timeliness": "On time",
        "DaysLeft": "3-7", "GradedSoFar": 25, "ItemWeight": ">15%", "LoadToday": "Med", "LoadTomorrow": "High"}
NO_GRADED = {  # nothing graded: Med difficulty and mastery, 25% table, study unknown
    "M1": "Med", "M2": "Med", "M3": "Med", "D1": "Med", "D2": "Med", "D3": "Med", "Timeliness": "On time",
    "DaysLeft": "8+", "GradedSoFar": 25, "ItemWeight": "<=15%", "LoadToday": "Low", "LoadTomorrow": "Low"}
HIDDEN_STATS = {k: v for k, v in FULL.items() if not k.startswith("M")} | {"Perf": "Med"}  # mastery unknown
CASES = [  # (name, course, evidence)
    ("full evidence", "MATH 100", FULL),
    ("no graded items", "COSC 111", NO_GRADED),
    ("hidden class statistics", "ECON 101", HIDDEN_STATS),
    ("timer used, low study, often late", "BIOL 116", FULL | {"Study": "Low", "Timeliness": "Often late or missing"}),
    ("50% checkpoint, heavy item", "PSYO 111", FULL | {"GradedSoFar": 50, "DaysLeft": "1-2", "LoadToday": "High"}),
    ("weak student, hard exam", "CHEM 111", FULL | {"M1": "Low", "M2": "Low", "M3": "Med", "D1": "Hard", "D3": "Hard"}),
    ("strong student, easy exam", "ENGL 112", FULL | {"M1": "High", "M2": "High", "M3": "High", "D1": "Easy", "D2": "Easy", "D3": "Easy"}),
]
STRESS_CASES = [  # (name, load counts in deadlines, H, optional theta and tapped stress level)
    ("no tap, quiet days", {"load_today": 0, "load_tomorrow": 0, "hours": 8}),
    ("no tap, busy days", {"load_today": 3, "load_tomorrow": 1, "hours": 8}),
    ("tapped High stress", {"load_today": 1, "load_tomorrow": 0, "hours": 8, "stress_now": "High"}),
    ("theta 0.3", {"load_today": 2, "load_tomorrow": 0, "hours": 10, "theta": 0.3, "stress_now": "Low"}),
]

if __name__ == "__main__":
    cpts = load_cpts(ROOT / "priors" / "tables" / "cpts.json")
    queries = [{"name": f"{n} / {a}", "course": c, "evidence": e, "action": a, **answer(cpts, c, e, a)}
               for n, c, e in CASES for a in ("Intense", "Light", "Rest")]
    curves = [{"name": n, **a, "curve": stress_curve(cpts, a["load_today"], a["load_tomorrow"], a["hours"],
                                                      a.get("theta", 0.2), a.get("stress_now"))}
              for n, a in STRESS_CASES]
    out = ROOT / "shared" / "fixtures" / "inference.json"
    out.write_text(json.dumps({"cpts": "priors/tables/cpts.json", "model_version": cpts["model_version"],
                               "queries": queries, "stress_curves": curves}, indent=1) + "\n")
    print(f"wrote {len(queries)} queries to {out}")
