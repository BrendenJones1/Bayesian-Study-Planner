"""Four simulated students and the plan the model chooses for each (docs/design-v2.md, Evaluation: Personas).

Research basis: expected-utility decision making (von Neumann & Morgenstern) over exact plan search,
EU = sum_c 100*P_c(a_c) - lambda*100*S(h), h = total hours <= H (design-v2, Decision). Probabilities come
from cpts.json via bsp_eval.network; lambda and theta are settings, never fitted.
"""

import itertools

from .network import answer, stress_curve

DIFFICULTIES = ["Easy", "Med", "Hard"]
LAMBDAS = {"grades": 0.1, "balanced": 0.4, "wellbeing": 1.0}  # mirrors LAMBDA_PRESETS in extension/src/model/constants.ts
THETAS = [0, 0.1, 0.2, 0.3]
HOURS = {"Intense": 5, "Light": 1, "Rest": 0}  # Intense first: ties go to the more study, as in the extension
BASE = {"Timeliness": "On time", "GradedSoFar": 25, "ItemWeight": ">15%"}
# Each persona is an evidence set: courses (course, target, mastery, days left), the shared load counts and H.
PERSONAS = {
    "struggling": {"courses": [("MATH 100", 72, "Low", "3-7")], "load_today": 1, "load_tomorrow": 1, "H": 6,
                   "extra": {"Timeliness": "Often late or missing"}},
    "advanced": {"courses": [("MATH 100", 80, "High", "3-7")], "load_today": 1, "load_tomorrow": 1, "H": 6, "extra": {}},
    "overloaded": {"courses": [("MATH 100", 72, "Med", "1-2"), ("COSC 111", 72, "Med", "3-7"),
                               ("ECON 101", 72, "Low", "3-7")],
                   "load_today": 3, "load_tomorrow": 3, "H": 6, "extra": {"Timeliness": "Often late or missing"}},
    "far from the exam": {"courses": [("MATH 100", 72, "Med", "8+")], "load_today": 0, "load_tomorrow": 0, "H": 6,
                          "extra": {}},
}


def best_plan(p: list[dict], curve: list[float], lam: float) -> tuple[str, ...]:
    """The plan (one action per course) with the highest EU that fits in len(curve)-1 hours."""
    plans = [a for a in itertools.product(HOURS, repeat=len(p)) if sum(HOURS[x] for x in a) < len(curve)]
    eu = lambda a: sum(100 * p[i][x] for i, x in enumerate(a)) - lam * 100 * curve[sum(HOURS[x] for x in a)]
    return max(plans, key=eu)  # max keeps the first of equal plans, i.e. the more study


def plan_table(cpts: dict) -> list[dict]:
    """One row per persona x difficulty x lambda preset x theta, with the chosen plan."""
    rows = []
    for name, ps in PERSONAS.items():
        for diff in DIFFICULTIES:
            p = []
            for course, target, mastery, days in ps["courses"]:
                ev = {**BASE, **ps["extra"], "DaysLeft": days, "LoadToday": "Med", "LoadTomorrow": "Med",
                      **{f"M{i}": mastery for i in (1, 2, 3)}, **{f"D{i}": diff for i in (1, 2, 3)}}
                p.append({a: answer(cpts, course, ev, a, [target])["p_grade"][target] for a in HOURS})
            for theta in THETAS:
                curve = stress_curve(cpts, ps["load_today"], ps["load_tomorrow"], ps["H"], theta)
                for lam_name, lam in LAMBDAS.items():
                    rows.append({"persona": name, "difficulty": diff, "lambda": lam_name, "theta": theta,
                                 "plan": best_plan(p, curve, lam)})
    return rows


def difficulty_changes_action(rows: list[dict]) -> bool:
    """True if, for some persona, lambda and theta, the plan differs across Easy, Med and Hard."""
    seen: dict[tuple, set] = {}
    for r in rows:
        seen.setdefault((r["persona"], r["lambda"], r["theta"]), set()).add(r["plan"])
    return any(len(v) > 1 for v in seen.values())
