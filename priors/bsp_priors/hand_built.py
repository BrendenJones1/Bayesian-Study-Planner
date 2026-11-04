"""Hand-built deterministic CPTs: exam difficulty, Perf, and Study before the exam.

Research basis: design-v2 (Network, Prediction). Study-volume anchor of ~3 h per course per week
from Babcock & Marks (2011); active-day cuts are OULAD thirds. Nothing here is learned, so no smoothing.
Every row is one-hot: P = 1 for the state the rule gives.
"""

import itertools

from bsp_priors.ingest_oulad import DIFFICULTY, LEVELS

DAYS_LEFT = ["1-2", "3-7", "8+"]
ACTIONS = {"Intense": 5.0, "Light": 1.0, "Rest": 0.0}  # hours today
# Assumed representative values inside each bucket (design-v2 gives only the cuts):
PACE_HOURS_WEEK = {"Low": 1.0, "Med": 3.0, "High": 5.0}  # inside the 2 h / 4 h volume cuts
PACE_ACTIVE_SHARE = {"Low": 0.1, "Med": 0.3, "High": 0.6}  # inside the OULAD thirds cuts
DAYS = {"1-2": 2, "3-7": 5, "8+": 10}  # remaining days, representative


def _one_hot(states: list[str], s: str) -> list[float]:
    return [1.0 if x == s else 0.0 for x in states]


def _mean_rounded(levels: tuple[str, ...], states: list[str]) -> str:
    return states[round(sum(states.index(x) for x in levels) / len(levels))]  # thirds, so never a .5 tie


def _mean_table(child: str, states: list[str], parent_names: list[str]) -> dict:
    parents = {p: states for p in parent_names}
    values = {"|".join(u): _one_hot(states, _mean_rounded(u, states)) for u in itertools.product(*parents.values())}
    return {"parents": parents, "states": states, "values": values,
            "explanation": f"{child} = the mean of the three parent levels (first state = 0, middle = 1, last = 2), "
                           "rounded. Example: (0, 0, 1) has mean 0.33, which rounds to 0."}


def _bucket(x: float, low_max: float, med_max: float) -> int:
    return 0 if x <= low_max else 1 if x <= med_max else 2


def study_before(study: str, action: str, days: str, cuts: dict, volume: dict) -> str:
    """Pace held for the remaining days, then today's action; volume level + active-day level summed."""
    n = DAYS[days]
    hours_week = (PACE_HOURS_WEEK[study] / 7 * n + ACTIONS[action]) / (n + 1) * 7
    active = (PACE_ACTIVE_SHARE[study] * n + (ACTIONS[action] > 0)) / (n + 1)
    total = _bucket(hours_week, volume["low_max"], volume["med_max"]) + _bucket(active, cuts["low_max"], cuts["med_max"])
    return LEVELS[0 if total <= 1 else 1 if total == 2 else 2]


def study_before_table(cuts: dict, volume: dict) -> dict:
    parents = {"study": LEVELS, "action": list(ACTIONS), "days_left": DAYS_LEFT}
    values = {"|".join(u): _one_hot(LEVELS, study_before(u[0], u[1], u[2], cuts, volume)) for u in itertools.product(*parents.values())}
    return {"parents": parents, "states": LEVELS, "values": values,
            "explanation": "Window = days left + today. Hours/week = (pace_h_per_week/7 * days + action hours) / (days + 1) * 7, "
                           f"pace Low/Med/High = {list(PACE_HOURS_WEEK.values())} h, days 1-2/3-7/8+ = {list(DAYS.values())}, "
                           "action 5/1/0 h. Active share = (pace_share * days + 1 if action is not Rest) / (days + 1), "
                           f"pace share = {list(PACE_ACTIVE_SHARE.values())}. Each is bucketed 0/1/2 by the volume and active-day "
                           "cuts in cut_points; the two levels are summed: 0-1 Low, 2 Med, 3-4 High."}


def hand_built(cuts: dict, volume: dict) -> dict:
    return {"exam_difficulty": _mean_table("Exam difficulty", DIFFICULTY, ["d1", "d2", "d3"]),
            "perf": _mean_table("Perf", LEVELS, ["m1", "m2", "m3"]),
            "study_before": study_before_table(cuts, volume)}
