import re
from pathlib import Path

REPO = Path(__file__).parents[2]
COLUMNS = ["#", "Decision", "Options weighed", "Chosen", "Why", "Cost accepted"]
REQUIRED = [
    "counting instead of a continuous model", "laplace smoothing", "a discrete network",
    "pgmpy plus typescript enumeration", "oulad and ubc joined only by class standing",
    "stress affects the action only", "personal offset with a back-test-chosen m",
    "exhaustive search instead of greedy", "google calendar exception", "canvas stays read-only",
]
HEADINGS = set(re.findall(r"^## (.+)$", (REPO / "docs/design-v2.md").read_text(), re.MULTILINE))


def parse(text):
    cells = [[c.strip() for c in ln.strip("|").split(" | ")] for ln in text.splitlines() if ln.startswith("|")]
    return cells[0], cells[2:]


def missing_decisions(rows):
    decisions = [r[1].lower() for r in rows]
    return [d for d in REQUIRED if not any(d in x for x in decisions)]


def bad_citations(rows):
    bad = []
    for r in rows:
        cited = [c.strip() for c in re.findall(r"§ ([^;|]+?)(?=;|$)", r[4].rstrip(". "))]
        if not cited or not set(cited) <= HEADINGS:
            bad.append(r[0])
    return bad


HEADER, ROWS = parse((REPO / "docs/tradeoffs-v2.md").read_text())


def test_criterion_1_table_has_the_required_columns():
    assert HEADER == COLUMNS


def test_criterion_2_one_row_for_each_required_decision():
    assert missing_decisions(ROWS) == []


def test_criterion_3_every_row_cites_an_existing_design_heading():
    assert bad_citations(ROWS) == []


def test_criterion_4_test_fails_if_a_row_is_missing_or_cites_a_missing_heading():
    assert missing_decisions(ROWS[1:]) != []
    broken = [r[:4] + [r[4].replace("§ Network", "§ No such heading")] + r[5:] for r in ROWS]
    assert bad_citations(broken) == ["3"]
