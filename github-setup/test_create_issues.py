"""Tests for create_issues.py: depends_on, dry-run reads, and update-in-place.

Pure functions plus a stub in place of `gh`, so they run in CI without PyYAML or a network.
"""
from collections import Counter

import create_issues as ci
import pytest

STORY = {"key": "S", "title": "Story: X", "story": "As a dev, I want X.", "design_section": "Network"}


def task(title, deps=(), **extra):
    return {"title": title, "labels": ["type:task"], "criteria": ["it works"], "depends_on": list(deps), **extra}


class StubGH:
    """Records issue writes; stands in for the GH helper."""

    repo = "o/r"
    dry = False

    def __init__(self):
        self.stats = Counter()
        self.writes = []
        self.next = 100

    def api(self, method, path, payload=None, read_only=False):
        self.writes.append((method, path, payload))
        self.next += 1
        return {"number": self.next, "id": self.next * 10, "title": payload.get("title"),
                "html_url": f"https://github.com/o/r/issues/{self.next}", "labels": [],
                "body": payload.get("body", "")}


def test_depends_on_puts_a_line_at_the_top_of_the_body():
    body = ci.task_body(task("B", ["A"]), STORY, "http://doc", numbers={"A": 12})
    assert body.splitlines()[0] == "Depends on #12"


def test_depends_on_lists_every_dependency_in_the_order_given():
    body = ci.task_body(task("C", ["B", "A"]), STORY, "http://doc", numbers={"A": 7, "B": 12})
    assert body.splitlines()[0] == "Depends on #12, #7"


def test_depends_on_resolves_a_previous_title():
    numbers = {}
    ci.remember(numbers, {"title": "New A", "previous_titles": ["Old A"]}, 5)
    body = ci.task_body(task("B", ["Old A"]), STORY, "http://doc", numbers=numbers)
    assert body.splitlines()[0] == "Depends on #5"


def test_a_task_without_depends_on_has_no_depends_line():
    body = ci.task_body(task("A"), STORY, "http://doc", numbers={})
    assert "Depends on" not in body
    assert body.startswith("Part of **Story: X**.")


def test_an_unknown_dependency_is_an_error_that_names_it():
    with pytest.raises(ValueError, match="Nonexistent task"):
        ci.task_body(task("B", ["Nonexistent task"]), STORY, "http://doc", numbers={})


def test_tasks_are_ordered_after_their_dependencies():
    a, b, c = task("A", ["B"]), task("B", ["C"]), task("C")
    ordered = ci.order_tasks([(STORY, a), (STORY, b), (STORY, c)])
    assert [t["title"] for _, t in ordered] == ["C", "B", "A"]


def test_order_is_unchanged_when_nothing_depends_on_anything():
    tasks = [(STORY, task(n)) for n in "DBCA"]
    assert [t["title"] for _, t in ci.order_tasks(tasks)] == list("DBCA")


def test_a_dependency_on_a_previous_title_orders_correctly():
    a = task("New A", previous_titles=["Old A"])
    b = task("B", ["Old A"])
    ordered = ci.order_tasks([(STORY, b), (STORY, a)])
    assert [t["title"] for _, t in ordered] == ["New A", "B"]


def test_a_dependency_cycle_is_rejected():
    with pytest.raises(ValueError, match="cycle"):
        ci.order_tasks([(STORY, task("A", ["B"])), (STORY, task("B", ["A"]))])


def test_validate_reports_a_dependency_cycle():
    plan = {
        "labels": [{"name": "type:task"}],
        "milestones": [{"key": "future"}],
        "stories": [{**STORY, "labels": ["type:task"], "tasks": [task("A", ["B"]), task("B", ["A"])]}],
    }
    assert any("cycle" in e for e in ci.validate(plan))


def test_created_issue_body_starts_with_depends_on_and_dependencies_are_created_first():
    gh = StubGH()
    pairs = [(STORY, task("B", ["A"])), (STORY, task("A"))]
    created = ci.create_tasks(gh, {}, pairs, {}, "http://doc", "", update=False)
    assert [i["title"] for _, i in created] == ["A", "B"]
    a_number = created[0][1]["number"]
    assert gh.writes[1][2]["body"].splitlines()[0] == f"Depends on #{a_number}"


def test_a_dependency_on_an_existing_issue_outside_the_plan_resolves():
    gh = StubGH()
    cache = {"Spike: concluded courses": {"number": 12, "title": "Spike: concluded courses", "labels": []}}
    created = ci.create_tasks(gh, cache, [(STORY, task("B", ["Spike: concluded courses"]))], {}, "http://doc", "",
                              update=False)
    assert gh.writes[0][2]["body"].splitlines()[0] == "Depends on #12"
    assert created[0][1]["title"] == "B"


def test_update_leaves_an_identical_issue_alone():
    gh = StubGH()
    t = task("A")
    body = ci.task_body(t, STORY, "http://doc", numbers={})
    existing = {"number": 9, "title": "A", "body": body, "labels": [{"name": "type:task"}],
                "milestone": {"number": 3}}
    ci.create_issue(gh, {"A": existing}, "A", body, ["type:task"], 3, update=True)
    assert gh.writes == []
    assert gh.stats["unchanged"] == 1


def test_update_rewrites_a_changed_issue_in_place_under_its_previous_title():
    gh = StubGH()
    existing = {"number": 9, "title": "Old", "body": "old body", "labels": [{"name": "type:task"}], "milestone": None}
    ci.create_issue(gh, {"Old": existing}, "New", "new body", ["type:task"], None, ["Old"], update=True)
    method, path, payload = gh.writes[0]
    assert (method, path) == ("PATCH", "repos/o/r/issues/9")
    assert payload["title"] == "New"
    assert gh.stats["updated"] == 1


def test_update_replaces_a_priority_or_type_label_instead_of_adding_a_second():
    labels = ci.merge_labels(["type:stretch", "priority:p2", "area:extension", "hand-added"],
                             ["type:task", "priority:p1", "area:extension"])
    assert sorted(labels) == ["area:extension", "hand-added", "priority:p1", "type:task"]


def test_update_replaces_an_area_label_so_a_retargeted_issue_loses_its_old_area():
    labels = ci.merge_labels(["area:quiz", "type:task"], ["area:extension", "type:task"])
    assert sorted(labels) == ["area:extension", "type:task"]


def test_update_removes_the_labels_the_plan_lists_for_removal():
    gh = StubGH()
    existing = {"number": 9, "title": "A", "body": "b", "labels": [{"name": "claude-ready"}, {"name": "hand-added"}],
                "milestone": None}
    ci.create_issue(gh, {"A": existing}, "A", "b", ["type:stretch"], None, update=True, remove_labels=["claude-ready"])
    assert sorted(gh.writes[0][2]["labels"]) == ["hand-added", "type:stretch"]


def test_linking_a_sub_issue_moves_it_from_its_current_parent():
    gh = StubGH()
    ci.link_sub_issue(gh, {"number": 30}, {"number": 31, "id": 310}, set())
    method, path, payload = gh.writes[0]
    assert (method, path) == ("POST", "repos/o/r/issues/30/sub_issues")
    assert payload == {"sub_issue_id": 310, "replace_parent": True}


def test_a_link_that_already_exists_is_not_sent_again():
    gh = StubGH()
    ci.link_sub_issue(gh, {"number": 30}, {"number": 31, "id": 310}, {(30, 31)})
    assert gh.writes == []


def test_the_default_plan_is_issues_v2_and_the_v1_plan_is_archived():
    here = ci.HERE
    assert ci.DEFAULT_PLAN == here / "issues-v2.yaml"
    assert ci.DEFAULT_PLAN.exists()
    assert not (here / "issues.yaml").exists()
    assert (here / "archive" / "issues-v1.yaml").exists()


def test_dry_run_still_runs_read_only_gh_calls(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(ci.subprocess, "run", fake_run)
    gh = ci.GH("o/r", dry_run=True)
    gh.run(["api", "repos/o/r/issues"], read_only=True)
    gh.run(["label", "create", "x"])
    assert len(calls) == 1 and calls[0][1] == "api"


def test_milestone_with_a_previous_title_is_renamed_not_duplicated():
    class MilestoneGH(StubGH):
        dry = True

        def paginate(self, path):
            return [{"number": 4, "title": "Week 12 – Evaluation", "description": ""}]

    gh = MilestoneGH()
    numbers = ci.ensure_milestones(
        gh, [{"key": "w12", "title": "Week 12 – Offset, planner and calendar",
              "previous_titles": ["Week 12 – Evaluation"]}], update=True)
    assert numbers == {"w12": 4}
    assert gh.stats["milestones renamed"] == 1
