"""Writes shared/fixtures/inference.json: queries and the pgmpy answers the TypeScript enumeration must match.

Run from the repo root after any change to a CPT, the network structure or the offset formula:
    python eval/make_fixtures.py
Research basis: pgmpy VariableElimination is the reference (Koller & Friedman, PGM, ch. 9).
"""

import json
from pathlib import Path

from bsp_eval.network import answer, load_cpts

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

if __name__ == "__main__":
    cpts = load_cpts(ROOT / "priors" / "tables" / "cpts.json")
    queries = [{"name": f"{n} / {a}", "course": c, "evidence": e, "action": a, **answer(cpts, c, e, a)}
               for n, c, e in CASES for a in ("Intense", "Light", "Rest")]
    out = ROOT / "shared" / "fixtures" / "inference.json"
    out.write_text(json.dumps({"cpts": "priors/tables/cpts.json", "model_version": cpts["model_version"],
                               "queries": queries}, indent=1) + "\n")
    print(f"wrote {len(queries)} queries to {out}")
