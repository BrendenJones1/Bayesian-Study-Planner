"""Hand-built deterministic CPTs: exam difficulty, Perf, and Study before the exam.

Research basis: design-v2 (Network, Prediction). Study-volume anchor of ~3 h per course per week
from Babcock & Marks (2011); active-day cuts are OULAD thirds. Nothing here is learned, so no smoothing.
Every row is one-hot: P = 1 for the state the rule gives.
"""

import itertools

from bsp_priors.ingest_oulad import DIFFICULTY, LEVELS

DAYS_LEFT = ["1-2", "3-7", "8+"]
WINDOW_DAYS = 28  # same window as the OULAD CSV
ACTION_HOURS = {"Intense": 5.0, "Light": 1.0, "Rest": 0.0}  # hours today
PACE_H_PER_WEEK = {"Low": 1.0, "Med": 3.0, "High": 5.0}  # midpoints of the volume levels
VOLUME_CUTS_H_PER_WEEK = (2.0, 4.0)  # low < 2, med 2-4, high >= 4 (about 3 h/course/week, Babcock & Marks 2011)
# PLACEHOLDER: replace with the median share within each OULAD active-day third once G1 lands.
ACTIVE_SHARE = {"Low": 0.1, "Med": 0.3, "High": 0.6}
# PLACEHOLDER until G1 computes the OULAD thirds: midpoints between the representative active-day counts.
_REP_DAYS = [ACTIVE_SHARE[k] * (WINDOW_DAYS - 1) for k in ("Low", "Med", "High")]
ACTIVE_DAY_CUTS = ((_REP_DAYS[0] + _REP_DAYS[1]) / 2, (_REP_DAYS[1] + _REP_DAYS[2]) / 2)
DAYS_REP = {"1-2": 2, "3-7": 5, "8+": 10}  # only used when timer logs exist (not in this table)


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


def _bucket(x: float, cuts: tuple[float, float]) -> int:
    return 0 if x < cuts[0] else 1 if x < cuts[1] else 2


def study_before(study: str, action: str) -> str:
    """Level-only rule (no timer logs): pace over the elapsed window, today replaced by the action.

    Days left has no effect here; it matters only with real logs. With an exam more than 27 days
    away today is outside the window, so the action would add nothing (not modelled: the day buckets stop at 8+).
    """
    hours = PACE_H_PER_WEEK[study] * (WINDOW_DAYS - 1) / 7 + ACTION_HOURS[action]
    active = ACTIVE_SHARE[study] * (WINDOW_DAYS - 1) + (ACTION_HOURS[action] > 0)
    total = _bucket(hours / 4, VOLUME_CUTS_H_PER_WEEK) + _bucket(active, ACTIVE_DAY_CUTS)
    return LEVELS[0 if total <= 1 else 1 if total == 2 else 2]


def study_before_table() -> dict:
    parents = {"study": LEVELS, "action": list(ACTION_HOURS), "days_left": DAYS_LEFT}
    values = {"|".join(u): _one_hot(LEVELS, study_before(u[0], u[1])) for u in itertools.product(*parents.values())}
    return {"parents": parents, "states": LEVELS, "values": values,
            "explanation": f"Level-only fallback, used when there are no timer logs. Window = {WINDOW_DAYS} days. "
                           f"hours = pace * {WINDOW_DAYS - 1} / 7 + action hours; weekly = hours / 4; pace Low/Med/High = "
                           f"{list(PACE_H_PER_WEEK.values())} h/week, action Intense/Light/Rest = 5/1/0 h. "
                           f"active days = share * {WINDOW_DAYS - 1} + 1 if the action is not Rest; share = "
                           f"{list(ACTIVE_SHARE.values())} (placeholder). Weekly hours are bucketed 0/1/2 by cuts "
                           f"{list(VOLUME_CUTS_H_PER_WEEK)}, active days by cuts {[round(c, 2) for c in ACTIVE_DAY_CUTS]} "
                           "(placeholder); the two levels are summed: 0-1 Low, 2 Med, 3-4 High. Days left has no effect "
                           "in this fallback; with timer logs the logged hours and active days replace the pace for the "
                           "elapsed days and the pace covers only the remaining days."}


def hand_built() -> dict:
    return {"exam_difficulty": _mean_table("Exam difficulty", DIFFICULTY, ["d1", "d2", "d3"]),
            "perf": _mean_table("Perf", LEVELS, ["m1", "m2", "m3"]),
            "study_before": study_before_table()}
