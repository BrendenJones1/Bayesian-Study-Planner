"""The 23-node network of docs/design-v2.md (Network, Prediction), built from cpts.json and queried
with pgmpy VariableElimination.

Research basis: discrete Bayesian networks with exact inference by variable elimination
(Koller & Friedman, Probabilistic Graphical Models, ch. 9 and 17). No probability is typed here:
every table comes from cpts.json (learned or hand-built); the root nodes are evidence at query
time, so their priors are uniform (1/|X|) and never affect an answer once set as evidence.
"""

import itertools
import json
from pathlib import Path

from pgmpy.factors.discrete import TabularCPD
from pgmpy.inference import VariableElimination
from pgmpy.models import DiscreteBayesianNetwork

LEVELS = ["Low", "Med", "High"]
STRESS_SCORE = {"Low": 0.0, "Med": 0.5, "High": 1.0}  # design-v2 Decision: s~ in {0, 0.5, 1}
OFFSETS = [-2, -1, 0, 1, 2]  # personal offset in deciles; the baseline has no personal data
CHECKPOINTS = [25, 50]
DECILES = [str(d) for d in range(1, 11)]
TARGETS = [50, 55, 60, 64, 68, 72, 76, 80, 85, 90]


def load_cpts(path: Path) -> dict:
    return json.loads(Path(path).read_text())


def _cpd(name: str, table: dict, parents: list[str] | None = None) -> TabularCPD:
    """A TabularCPD from a cpts.json table; its parents are the table's parents, in order."""
    parents = parents or list(table["parents"])  # node names; the table's own parent names may differ
    states = list(table["parents"].values())
    cols = [table["values"]["|".join(u)] for u in itertools.product(*states)]
    return TabularCPD(name, len(table["states"]), [list(r) for r in zip(*cols)], parents,
                      [len(s) for s in states],
                      state_names={name: table["states"], **dict(zip(parents, states))})


def _root(name: str, states: list) -> TabularCPD:
    return TabularCPD(name, len(states), [[1 / len(states)]] * len(states), state_names={name: states})


def build_network(cpts: dict, course: str, target: int) -> DiscreteBayesianNetwork:
    """The network (23 nodes for 3 concepts; the concept count comes from the hand-built tables)."""
    t, h = cpts["tables"], cpts["hand_built"]
    diff, days = h["exam_difficulty"]["states"], h["study_before"]["parents"]["days_left"]
    final = t["final_standing_g25"]["parents"]
    weights = final["item_weight"]
    timely = t["exam_standing"]["parents"]["timeliness"]
    k = len(h["perf"]["parents"])  # concepts covered by the exam: 3 in the design
    ds, ms = [f"D{i}" for i in range(1, k + 1)], [f"M{i}" for i in range(1, k + 1)]
    cpds = [_root(d, diff) for d in ds] + [_root(m, LEVELS) for m in ms]
    cpds += [
        _cpd("ExamDifficulty", h["exam_difficulty"], ds),
        _cpd("Perf", h["perf"], ms),
        _root("Timeliness", timely), _root("DaysLeft", days), _root("GradedSoFar", CHECKPOINTS),
        _root("ItemWeight", weights), _root("LoadToday", LEVELS), _root("LoadTomorrow", LEVELS),
        _root("Action", list(h["study_before"]["parents"]["action"])),
        _root("PersonalOffset", OFFSETS),
        _cpd("Study", t["study"], ["Perf"]),
        _cpd("StudyBefore", h["study_before"], ["Study", "Action", "DaysLeft"]),
        _cpd("ExamStanding", t["exam_standing"], ["Perf", "StudyBefore", "Timeliness", "ExamDifficulty"]),
        _cpd("StressNow", t["stress_now"], ["LoadToday"]),
        _cpd("StressNext", t["stress_next"], ["StressNow", "LoadTomorrow"]),
    ]
    # Final standing: the checkpoint picks the table; the offset shifts the exam decile, clipped to 1..10.
    cols = []
    for perf, s, o, w, g in itertools.product(LEVELS, DECILES, OFFSETS, weights, CHECKPOINTS):
        shifted = str(min(10, max(1, int(s) + o)))
        cols.append(t[f"final_standing_g{g}"]["values"][f"{perf}|{shifted}|{w}"])
    cpds.append(TabularCPD("FinalStanding", 10, [list(r) for r in zip(*cols)],
                           ["Perf", "ExamStanding", "PersonalOffset", "ItemWeight", "GradedSoFar"],
                           [3, 10, len(OFFSETS), len(weights), len(CHECKPOINTS)],
                           state_names={"FinalStanding": DECILES, "Perf": LEVELS, "ExamStanding": DECILES,
                                        "PersonalOffset": OFFSETS, "ItemWeight": weights, "GradedSoFar": CHECKPOINTS}))
    p = (t["grade_map"]["courses"].get(course) or t["grade_map"]["pooled_medium"])[str(target)]  # P(grade >= target | final decile)
    cpds.append(TabularCPD("Grade", 2, [p, [1 - x for x in p]], ["FinalStanding"], [10],
                           state_names={"Grade": [True, False], "FinalStanding": DECILES}))
    net = DiscreteBayesianNetwork()
    for c in cpds:
        net.add_node(c.variable)
        net.add_edges_from((p_, c.variable) for p_ in c.variables[1:])
    net.add_cpds(*cpds)
    net.check_model()
    return net


def load_state(count: float, cuts: dict) -> str:
    """Bucket a (possibly fractional) deadline count by the StudentLife thirds in cpts.json cut_points."""
    return "Low" if count <= cuts["low_max"] else "Med" if count <= cuts["med_max"] else "High"


def stress_curve(cpts: dict, load_today: float, load_tomorrow: float, hours: int, theta: float = 0.2,
                 stress_now: str | None = None) -> list[float]:
    """S(h) = E[stress next | stress now, Load tomorrow + theta*h] for h = 0..hours (design-v2, Stress)."""
    cuts = cpts["cut_points"]["load_deadlines_next_3_days"]
    course = next(iter(cpts["tables"]["grade_map"]["courses"]))
    ve = VariableElimination(build_network(cpts, course, TARGETS[0]))  # stress is off the grade branch
    out = []
    for h in range(hours + 1):
        ev = {"LoadToday": load_state(load_today, cuts), "LoadTomorrow": load_state(load_tomorrow + theta * h, cuts)}
        if stress_now:
            ev["StressNow"] = stress_now
        f = ve.query(["StressNext"], ev, show_progress=False)
        out.append(sum(STRESS_SCORE[s] * float(f.get_value(StressNext=s)) for s in LEVELS))
    return out


def answer(cpts: dict, course: str, evidence: dict, action: str, targets: list[int] = TARGETS) -> dict:
    """P(grade >= t | e, a) for each target t, and E[stress next | e, a].

    evidence maps node names (e.g. "Perf", "GradedSoFar", "LoadTomorrow") to states. The baseline
    has no personal data, so PersonalOffset is set to 0.
    """
    ev = {"PersonalOffset": 0, **evidence, "Action": action}
    p_grade, stress = {}, None
    for t in targets:
        ve = VariableElimination(build_network(cpts, course, t))
        p_grade[t] = float(ve.query(["Grade"], ev, show_progress=False).get_value(Grade=True))
        if stress is None:
            f = ve.query(["StressNext"], ev, show_progress=False)
            stress = sum(STRESS_SCORE[s] * float(f.get_value(StressNext=s)) for s in LEVELS)
    return {"p_grade": p_grade, "e_stress_next": stress}
