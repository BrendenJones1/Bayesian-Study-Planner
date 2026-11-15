"""Learn p0 and m for the personal offset (docs/design-v2.md, Personal offset).

Research basis: a Dirichlet-multinomial prior with m pseudo-counts, so the posterior mean is
(m p0(k) + N(k)) / (m + N) (Murphy, Machine Learning: A Probabilistic Perspective, ch. 3);
m is chosen by sequential (prequential) log-loss, scoring each item before it is counted
(Dawid 1984, Present position and potential developments); p0 is Laplace smoothed (alpha = 1).

Residuals are actual decile minus the BASELINE's most likely decile, clipped to +-2. The baseline is the
exam_standing CPT alone; nothing here takes an offset, so a residual can never feed on the offset
(CLAUDE.md rule 5d). Only train-split students are used, so held-out students never pick m (rule 5b).
Assessments of a presentation are ordered by id_assessment, which OULAD assigns in date order;
the committed CSVs carry no dates.
"""

import math
from collections import Counter, defaultdict

from bsp_priors.fit import DECILES, smooth

STATES = [-2, -1, 0, 1, 2]
CLIP = 2
M_GRID = [1, 2, 5, 10, 20, 50]
MIN_ITEMS = 4  # students with fewer assessments in a presentation are not back-tested
PARENTS = ("perf", "study", "timeliness", "exam_difficulty")


def residual(actual: int, predicted: int) -> int:
    """Actual decile minus the baseline's decile, clipped to +-2."""
    return max(-CLIP, min(CLIP, actual - predicted))


def baseline_mode(exam_cpt: dict, row: dict) -> int:
    """The baseline's most likely decile (ties go to the lower decile), from the exam_standing CPT only."""
    p = exam_cpt["values"]["|".join(row[c] for c in PARENTS)]
    return int(DECILES[p.index(max(p))])


def sequences(rows: list[dict], exam_cpt: dict) -> dict:
    """{(student, module, presentation): [residual, ...]} in assessment order, from baseline residuals."""
    by_key: dict = defaultdict(list)
    for r in rows:
        by_key[(r["id_student"], r["code_module"], r["code_presentation"])].append(r)
    return {
        k: [residual(int(r["exam_standing"]), baseline_mode(exam_cpt, r)) for r in sorted(v, key=lambda r: int(r["id_assessment"]))]
        for k, v in by_key.items()
    }


def p0_table(seqs: dict) -> list[float]:
    """Laplace-smoothed share of residuals at each k in STATES, over every item."""
    return smooth(Counter(k for s in seqs.values() for k in s), STATES)


def p_offset(p0: list[float], counts: Counter, m: float) -> list[float]:
    """P(O = k) = (m p0(k) + N(k)) / (m + N)."""
    n = sum(counts.values())
    return [(m * p0[i] + counts[k]) / (m + n) for i, k in enumerate(STATES)]


def _logloss(items: list[tuple[Counter, int]], p0: list[float], m: float) -> float:
    """Mean -log P(O = residual) over (counts-before, residual) pairs."""
    return -sum(math.log(p_offset(p0, c, m)[STATES.index(k)]) for c, k in items) / len(items)


def _later_items(seqs: dict) -> list[tuple[Counter, int]]:
    """For each item after the first of a 4+ item sequence: (the student's earlier residuals, its residual)."""
    out = []
    for s in seqs.values():
        if len(s) >= MIN_ITEMS:
            out += [(Counter(s[:t]), s[t]) for t in range(1, len(s))]
    return out


def cross_module(seqs: dict, p0: list[float], m: float) -> dict:
    """Do offsets carry across modules? Items of a later module scored with counts from earlier modules only.

    "Later" is by presentation code (2013J < 2014B), the first character of the year-and-term string order.
    """
    by_student: dict = defaultdict(list)
    for (sid, mod, pres), s in seqs.items():
        by_student[sid].append((pres, mod, s))
    items = []
    for runs in by_student.values():
        for pres, mod, s in runs:
            earlier = Counter(k for p, md, r in runs if md != mod and p < pres for k in r)
            if earlier:
                items += [(earlier, k) for k in s]
    if not items:
        return {"items": 0, "carries": False}
    with_offset, without = _logloss(items, p0, m), _logloss([(Counter(), k) for _, k in items], p0, m)
    return {"items": len(items), "logloss_with_other_module_counts": with_offset,
            "logloss_p0_only": without, "carries": with_offset < without}


def learn(rows: list[dict], exam_cpt: dict) -> dict:
    """p0, the m with the lowest back-test log-loss, and the evidence, from train-split rows only."""
    seqs = sequences(rows, exam_cpt)
    p0 = p0_table(seqs)
    items = _later_items(seqs)
    by_m = {m: _logloss(items, p0, m) for m in M_GRID}
    m = min(M_GRID, key=lambda k: by_m[k])
    return {
        "states": STATES, "clip": CLIP, "p0": p0, "m": m,
        "backtest": {"items": len(items), "logloss_by_m": {str(k): v for k, v in by_m.items()},
                     "logloss_baseline_only": _logloss([(Counter(), k) for _, k in items], p0, m),
                     "cross_module": cross_module(seqs, p0, m)},
    }
