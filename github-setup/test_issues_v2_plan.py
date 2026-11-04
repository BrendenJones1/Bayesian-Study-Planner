"""Checks on github-setup/issues-v2.yaml that need no network.

Skipped when PyYAML is missing (CI installs it only after the workflow change in the plan).
"""
from pathlib import Path

import create_issues as ci
import pytest

yaml = pytest.importorskip("yaml")

PLAN = yaml.safe_load((Path(__file__).parent / "issues-v2.yaml").read_text())
STORIES = PLAN["stories"]
TASKS = [(s, t) for s in STORIES for t in s["tasks"]]
BY_TITLE = {}
for _, t in TASKS:
    for title in [t["title"], *t.get("previous_titles", [])]:
        BY_TITLE[title] = t

# Existing issues that depends_on may name without being part of the plan.
EXISTING_ISSUES = {
    "Spike: concluded courses and the score-statistics threshold at UBCO",
    "Ship the logging MVP to me and friends (load unpacked) with consent notes",
}
V2_SECTIONS = {
    "Overview", "Architecture", "Data sources", "Network", "Prediction", "Learning the CPTs",
    "Personal offset (the personalized model)", "Stress", "Decision", "Evaluation",
    "Assumptions and limitations", "Out of scope and future work",
}
PARKED_FUTURE_TITLES = {
    "Stretch: Shared class question bank (requires instructor buy-in)",
    "Stretch: Redis cache for the shared question bank",
    "Stretch: End-of-term data donation and yearly priors release",
    "Stretch: Optional sleep and wellbeing inputs",
    "Stretch: Higher-quality quizzes with the student's own API key",
    "Stretch: Differential privacy on donated aggregates",
    "Stretch: Chrome Web Store listing",
    "Stretch: Support other Canvas schools",
}


def labels(task):
    return set(task["labels"])


def refs(*ids):
    return [t for _, t in TASKS if t.get("ref") in ids]


def test_the_plan_passes_the_scripts_own_validation():
    assert ci.validate(PLAN) == []


def test_every_depends_on_names_a_plan_task_or_a_known_existing_issue():
    unknown = [(t["title"], d) for _, t in TASKS for d in t.get("depends_on", [])
               if d not in BY_TITLE and d not in EXISTING_ISSUES]
    assert unknown == []


def test_every_claude_ready_task_names_a_v2_section_and_has_criteria():
    for story, t in TASKS:
        if "claude-ready" not in labels(t):
            continue
        section = t.get("design_section") or story.get("design_section")
        assert section in V2_SECTIONS, f"{t['title']}: section {section!r}"
        assert len(t["criteria"]) >= 3, f"{t['title']}: too few criteria"


def test_the_graded_core_is_priority_p1():
    core = refs("G1", "G2", "G3", "G4", "G5", "G6", "G7", "G19", "G20", "G21")
    assert len(core) >= 10
    assert [t["title"] for t in core if "priority:p1" not in labels(t)] == []
    for title in ("Final report with research basis, evaluation and limitations",
                  "Script and slides for the presentation"):
        assert "priority:p1" in labels(BY_TITLE[title])


def test_tasks_that_need_a_human_are_labelled_needs_human_and_not_claude_ready():
    must = ["Prospective calibration on pilot exports", "Script and slides for the presentation",
            "Final report with research basis, evaluation and limitations",
            "Check dataset licences and record attribution",
            "Replace the priors nightly workflow with publish-on-change",
            "Apply the v2 workflow and CI guardrail changes"]
    for title in must:
        assert "needs-human" in labels(BY_TITLE[title]), title
        assert "claude-ready" not in labels(BY_TITLE[title]), title


def test_a_task_that_edits_a_workflow_is_never_claude_ready():
    for _, t in TASKS:
        text = " ".join([t["title"], t.get("context", ""), *t["criteria"]])
        if "priors-nightly.yml" in text or "claude-review.yml" in text:
            assert "claude-ready" not in labels(t), t["title"]


def test_every_gap_g1_to_g24_has_a_task():
    covered = {t.get("ref") for _, t in TASKS}
    # G8, G10, G11, G13 and G16 are split across several tasks; G17 and G18 have their own.
    missing = {f"G{i}" for i in range(1, 25)} - covered
    assert missing == set()


def test_milestones_carry_the_agreed_due_dates():
    due = {m["key"]: m["due_on"] for m in PLAN["milestones"]}
    assert due == {"w9": "2026-11-07T07:59:00Z", "w10": "2026-11-14T07:59:00Z", "w11": "2026-11-21T07:59:00Z",
                   "w12": "2026-11-28T07:59:00Z", "w13": "2026-12-05T07:59:00Z", "w14": "2026-12-12T07:59:00Z",
                   "future": None}


def test_parked_future_items_are_left_out_of_the_plan():
    titles = {s["title"] for s in STORIES + PLAN.get("stretch", [])}
    titles |= {t["title"] for _, t in TASKS}
    assert titles & PARKED_FUTURE_TITLES == set()


def test_the_plan_names_the_v2_design_doc_on_main():
    assert PLAN["design_doc_url"].endswith("/blob/main/docs/design-v2.md")
