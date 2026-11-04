#!/usr/bin/env python3
"""Create labels, milestones, user-story issues, linked sub-issues and a
Project board from issues.yaml, using the GitHub CLI (gh).

Usage
  python create_issues.py --repo OWNER/REPO --dry-run
  python create_issues.py --repo OWNER/REPO --project "Bayesian Study Planner"
  python create_issues.py --repo OWNER/REPO --plan issues-v2.yaml --update --dry-run

Requirements
  - gh installed and logged in:   gh auth login
  - for --project, add the scope:  gh auth refresh -s project
  - PyYAML:                        pip install pyyaml

Safe to re-run: existing labels are updated, existing milestones and
issues (matched by title or any `previous_titles`) are reused, and existing
sub-issue links are skipped. With --update, existing issues also get the
current title, body and milestone from the plan, and are left alone when
nothing changed; their labels are merged (labels you added by hand are kept,
but a plan `priority:` or `type:` label replaces the old one). A milestone
whose `previous_titles` match an existing milestone is renamed in place.

A task may set `depends_on: [<task title>, ...]` (titles or previous titles of
plan tasks, or titles of existing issues). The issue body then starts with
"Depends on #N, #M", and tasks are created after the tasks they depend on.

--dry-run makes no writes, but still reads from GitHub, so it reports which
issues would be new, updated or unchanged.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent

# A plan label with one of these prefixes replaces the issue's old label with that prefix.
EXCLUSIVE_PREFIXES = ("priority:", "type:", "area:")
FAKE_NUMBER_START = 100_000  # dry-run stand-ins for issues that do not exist yet


# ----------------------------------------------------------------- gh helpers
class GH:
    def __init__(self, repo: str, dry_run: bool):
        self.repo = repo
        self.dry = dry_run
        self.stats: Counter[str] = Counter()
        self._fake_number = FAKE_NUMBER_START

    def run(self, args: list[str], stdin: str | None = None, read_only: bool = False) -> str:
        cmd = ["gh", *args]
        if self.dry and not read_only:
            print("  [dry-run] " + " ".join(_shorten(a) for a in cmd))
            return ""
        res = subprocess.run(cmd, check=False, input=stdin, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"gh failed: {' '.join(cmd)}\n{res.stderr.strip()}")
        return res.stdout

    def api(self, method: str, path: str, payload: dict | None = None, read_only: bool = False) -> dict | list | None:
        args = ["api", "-X", method, path, "-H", "Accept: application/vnd.github+json"]
        stdin = None
        if payload is not None:
            # --input keeps integers as integers (sub_issue_id must be an int)
            args += ["--input", "-"]
            stdin = json.dumps(payload)
        out = self.run(args, stdin=stdin, read_only=read_only)
        return json.loads(out) if out.strip() else None

    def paginate(self, path: str) -> list[dict]:
        out = self.run(["api", "--paginate", path, "--jq", ".[] | @json"], read_only=True)
        return [json.loads(line) for line in out.splitlines() if line.strip()]

    def fake_issue(self, title: str) -> dict:
        self._fake_number += 1
        return {"number": self._fake_number, "id": self._fake_number * 10, "title": title,
                "html_url": f"https://github.com/{self.repo}/issues/{self._fake_number}"}


def _shorten(s: str, n: int = 90) -> str:
    return s if len(s) <= n else s[: n - 3] + "..."


# ----------------------------------------------------------------- body builders
def story_body(story: dict, doc_url: str) -> str:
    parts = [f"**User story.** {story['story']}"]
    if story.get("design_section"):
        parts.append(f"**Design doc:** [{story['design_section']}]({doc_url})")
    if story.get("research"):
        parts.append(f"**Research basis:** {story['research']}")
    if story.get("notes"):
        parts.append(f"**Notes.** {story['notes'].strip()}")
    if story.get("tasks"):
        parts.append("Sub-issues below track the work. The story closes when every sub-issue is closed "
                     "and the behaviour is demonstrated end to end.")
    return "\n\n".join(parts)


def remember(numbers: dict[str, int], entry: dict, number: int) -> None:
    """Record an issue number under the entry's title and every previous title."""
    for title in [entry["title"], *entry.get("previous_titles", [])]:
        numbers[title] = number


def depends_line(task: dict, numbers: dict[str, int]) -> str:
    """'Depends on #N, #M' for the task's depends_on titles, or '' when it has none."""
    nums = []
    for title in task.get("depends_on", []):
        if title not in numbers:
            raise ValueError(f"No such task or issue for depends_on: {title!r} (in {task['title']!r})")
        nums.append(numbers[title])
    return "Depends on " + ", ".join(f"#{n}" for n in nums) if nums else ""


def task_body(task: dict, story: dict, doc_url: str, tradeoffs_url: str = "",
              numbers: dict[str, int] | None = None) -> str:
    lines = []
    dep = depends_line(task, numbers or {})
    if dep:
        lines += [dep, ""]
    lines += [f"Part of **{story['title']}**.", "", f"> {story['story']}", ""]
    if task.get("context"):
        ctx = task["context"].strip()
        if tradeoffs_url and "decision" in ctx.lower():
            ctx += f" Rationale: [Design tradeoffs]({tradeoffs_url})."
        lines += [ctx, ""]
    lines.append("### Acceptance criteria")
    lines += [f"- [ ] {c}" for c in task.get("criteria", [])]
    section = task.get("design_section") or story.get("design_section", "System design")
    lines += ["", f"Design doc: [{section}]({doc_url})"]
    if story.get("research"):
        lines.append(f"Research basis: {story['research']}")
    if "claude-ready" in task.get("labels", []):
        lines += ["", ("_Agent note: follow CLAUDE.md. Write one test per criterion, named after it. "
                       "Open a draft PR whose body starts with `Closes #<this issue>` and shows how "
                       "each criterion was verified._")]
    return "\n".join(lines)


def order_tasks(pairs: list[tuple[dict, dict]]) -> list[tuple[dict, dict]]:
    """Stable topological order: every task comes after the plan tasks it depends_on.

    Dependencies that match no plan task (existing issues) do not affect the order.
    Raises ValueError on a cycle.
    """
    owner: dict[str, int] = {}
    for i, (_, t) in enumerate(pairs):
        for title in [t["title"], *t.get("previous_titles", [])]:
            owner[title] = i
    deps = [{owner[d] for d in t.get("depends_on", []) if d in owner} for _, t in pairs]
    done: list[int] = []
    placed: set[int] = set()
    while len(done) < len(pairs):
        ready = next((i for i in range(len(pairs)) if i not in placed and deps[i] <= placed), None)
        if ready is None:
            stuck = [pairs[i][1]["title"] for i in range(len(pairs)) if i not in placed]
            raise ValueError("depends_on cycle among: " + "; ".join(stuck))
        done.append(ready)
        placed.add(ready)
    return [pairs[i] for i in done]


def merge_labels(current: list[str], wanted: list[str], remove: list[str] | None = None) -> list[str]:
    """Existing labels plus the plan's.

    A plan label with a priority:, type: or area: prefix replaces every existing label with that
    prefix, and `remove` names labels to drop. Other labels you added by hand are kept.
    """
    replaced = tuple(p for p in EXCLUSIVE_PREFIXES if any(lb.startswith(p) for lb in wanted))
    kept = [lb for lb in current if not (replaced and lb.startswith(replaced)) and lb not in (remove or [])]
    return list(dict.fromkeys(kept + wanted))


# ----------------------------------------------------------------- main steps
def ensure_labels(gh: GH, labels: list[dict]) -> None:
    print(f"\nLabels ({len(labels)})")
    for lb in labels:
        gh.run(["label", "create", lb["name"], "--color", lb["color"],
                "--description", lb.get("description", ""), "--force", "--repo", gh.repo])
        if not gh.dry:
            print(f"  ok  {lb['name']}")


def ensure_milestones(gh: GH, milestones: list[dict], update: bool = False) -> dict[str, int]:
    print(f"\nMilestones ({len(milestones)})")
    existing = {m["title"]: m for m in gh.paginate(f"repos/{gh.repo}/milestones?state=all&per_page=100")}
    numbers: dict[str, int] = {}
    for i, ms in enumerate(milestones, start=1):
        found = next((t for t in [ms["title"], *ms.get("previous_titles", [])] if t in existing), None)
        if found is not None:
            old = existing[found]
            numbers[ms["key"]] = old["number"]
            renamed = found != ms["title"]
            if renamed or (update and (old.get("description") or "") != ms.get("description", "")):
                payload = {"title": ms["title"], "description": ms.get("description", "")}
                if renamed and ms.get("due_on"):
                    payload["due_on"] = ms["due_on"]
                gh.api("PATCH", f"repos/{gh.repo}/milestones/{old['number']}", payload)
                gh.stats["milestones renamed" if renamed else "milestones updated"] += 1
                print(f"  {'rename' if renamed else 'update'} {found} -> {ms['title']}" if renamed
                      else f"  update {ms['title']}")
            else:
                print(f"  reuse  {ms['title']}")
            continue
        payload = {"title": ms["title"], "description": ms.get("description", "")}
        if ms.get("due_on"):
            payload["due_on"] = ms["due_on"]
        res = gh.api("POST", f"repos/{gh.repo}/milestones", payload)
        numbers[ms["key"]] = res["number"] if res else i
        gh.stats["milestones new"] += 1
        print(f"  new    {ms['title']}")
    return numbers


def existing_issues(gh: GH) -> dict[str, dict]:
    items = gh.paginate(f"repos/{gh.repo}/issues?state=all&per_page=100")
    return {it["title"]: it for it in items if "pull_request" not in it}


def create_issue(gh: GH, cache: dict[str, dict], title: str, body: str,
                 labels: list[str], milestone: int | None,
                 previous_titles: list[str] | None = None, update: bool = False,
                 remove_labels: list[str] | None = None) -> dict:
    existing = cache.get(title)
    if existing is None:
        for old in previous_titles or []:
            if old in cache:
                existing = cache[old]
                break
    if existing is not None:
        if not update:
            gh.stats["reused"] += 1
            print(f"  reuse  #{existing['number']} {existing['title']}")
            return existing
        current = [lb["name"] if isinstance(lb, dict) else lb for lb in existing.get("labels", [])]
        merged = merge_labels(current, labels, remove_labels)
        if (existing["title"] == title and (existing.get("body") or "").strip() == body.strip()
                and set(merged) == set(current)
                and (milestone is None or (existing.get("milestone") or {}).get("number") == milestone)):
            gh.stats["unchanged"] += 1
            print(f"  same   #{existing['number']} {title}")
            return existing
        payload = {"title": title, "body": body, "labels": merged}
        if milestone is not None:
            payload["milestone"] = milestone
        res = gh.api("PATCH", f"repos/{gh.repo}/issues/{existing['number']}", payload)
        updated = res if res else {**existing, "title": title}
        cache[title] = updated
        gh.stats["updated"] += 1
        renamed = f" (was: {existing['title']})" if existing["title"] != title else ""
        print(f"  update #{existing['number']} {title}{renamed}")
        return updated
    payload = {"title": title, "body": body, "labels": labels}
    if milestone is not None:
        payload["milestone"] = milestone
    res = gh.api("POST", f"repos/{gh.repo}/issues", payload)
    issue = res if res else gh.fake_issue(title)
    cache[title] = issue
    gh.stats["new"] += 1
    print(f"  new    #{issue['number']} {title}")
    return issue


def create_tasks(gh: GH, cache: dict[str, dict], pairs: list[tuple[dict, dict]], ms_numbers: dict[str, int],
                 doc_url: str, tradeoffs_url: str, update: bool) -> list[tuple[dict, dict]]:
    """Create or update every (story, task), dependencies first. Returns (story, issue) in that order."""
    numbers = {title: issue["number"] for title, issue in cache.items()}
    out = []
    for story, task in order_tasks(pairs):
        t_ms = ms_numbers.get(task.get("milestone", story.get("milestone", "future")))
        body = task_body(task, story, doc_url, tradeoffs_url, numbers)
        issue = create_issue(gh, cache, task["title"], body, task["labels"], t_ms,
                             task.get("previous_titles"), update, task.get("remove_labels"))
        remember(numbers, task, issue["number"])
        out.append((story, issue))
    return out


def link_sub_issue(gh: GH, parent: dict, child: dict, linked: set[tuple[int, int]]) -> None:
    key = (parent["number"], child["number"])
    if key in linked:
        return
    if not gh.dry:  # a dry run only counts the links it would add
        try:
            # replace_parent: the plan decides the parent, so a task moved to another story is re-linked
            gh.api("POST", f"repos/{gh.repo}/issues/{parent['number']}/sub_issues",
                   {"sub_issue_id": child["id"], "replace_parent": True})
        except RuntimeError as err:
            if "already" in str(err).lower() or "duplicate" in str(err).lower():
                return
            raise
    gh.stats["links new"] += 1
    linked.add(key)


def existing_links(gh: GH, parent_numbers: list[int]) -> set[tuple[int, int]]:
    links: set[tuple[int, int]] = set()
    for n in parent_numbers:
        for sub in gh.paginate(f"repos/{gh.repo}/issues/{n}/sub_issues?per_page=100"):
            links.add((n, sub["number"]))
    return links


def ensure_project(gh: GH, title: str, issues: list[dict]) -> None:
    owner = gh.repo.split("/")[0]
    print(f"\nProject: {title}")
    out = gh.run(["project", "list", "--owner", owner, "--format", "json"], read_only=True)
    number = None
    if out.strip():
        for p in json.loads(out).get("projects", []):
            if p.get("title") == title:
                number = p["number"]
    if number is None:
        out = gh.run(["project", "create", "--owner", owner, "--title", title, "--format", "json"])
        number = json.loads(out)["number"] if out.strip() else 0
        if not gh.dry:
            print(f"  new project #{number}")
    if not gh.dry:
        gh.run(["project", "link", str(number), "--owner", owner, "--repo", gh.repo])
    for issue in issues:
        gh.run(["project", "item-add", str(number), "--owner", owner, "--url", issue["html_url"]])
    if not gh.dry:
        print(f"  added {len(issues)} issues")


def validate(plan: dict) -> list[str]:
    errors = []
    keys = {m["key"] for m in plan["milestones"]}
    label_names = {lb["name"] for lb in plan["labels"]}
    for story in plan.get("stories", []) + plan.get("stretch", []):
        for lb in story.get("labels", []):
            if lb not in label_names:
                errors.append(f"{story['key']}: unknown label {lb}")
        ms = story.get("milestone", "future")
        if ms not in keys:
            errors.append(f"{story['key']}: unknown milestone {ms}")
        for t in story.get("tasks", []):
            if not t.get("criteria"):
                errors.append(f"{story['key']} / {t['title']}: no acceptance criteria")
            for lb in t.get("labels", []):
                if lb not in label_names:
                    errors.append(f"{story['key']} / {t['title']}: unknown label {lb}")
            if t.get("milestone") and t["milestone"] not in keys:
                errors.append(f"{story['key']} / {t['title']}: unknown milestone {t['milestone']}")
            if t["title"] in t.get("depends_on", []):
                errors.append(f"{story['key']} / {t['title']}: depends on itself")
    pairs = [(s, t) for s in plan.get("stories", []) for t in s.get("tasks", [])]
    try:
        order_tasks(pairs)
    except ValueError as err:
        errors.append(str(err))
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True, help="OWNER/REPO")
    ap.add_argument("--plan", default=str(HERE / "issues.yaml"))
    ap.add_argument("--project", help="Also create/reuse a Projects board with this title")
    ap.add_argument("--skip-stretch", action="store_true", help="Do not create the Future (v2+) issues")
    ap.add_argument("--update", action="store_true",
                    help="Also rewrite title, body and milestone of issues that already exist")
    ap.add_argument("--dry-run", action="store_true", help="Print what would happen; call nothing")
    args = ap.parse_args()

    import yaml  # imported here so the helpers above can be tested without PyYAML

    plan = yaml.safe_load(Path(args.plan).read_text())
    errs = validate(plan)
    if errs:
        print("Plan has problems:\n  " + "\n  ".join(errs))
        return 1

    gh = GH(args.repo, args.dry_run)
    doc_url = plan.get("design_doc_url", "")
    tradeoffs_url = plan.get("tradeoffs_doc_url", "")

    ensure_labels(gh, plan["labels"])
    ms_numbers = ensure_milestones(gh, plan["milestones"], args.update)
    cache = existing_issues(gh)
    created: list[dict] = []
    parents: dict[str, dict] = {}
    children: dict[str, list[dict]] = {}

    print("\nUser stories")
    for story in plan.get("stories", []):
        ms = ms_numbers.get(story.get("milestone", "future"))
        parents[story["key"]] = create_issue(gh, cache, story["title"], story_body(story, doc_url),
                                             story["labels"], ms, story.get("previous_titles"), args.update,
                                             story.get("remove_labels"))
        created.append(parents[story["key"]])

    print("\nSub-issues (dependencies first)")
    pairs = [(s, t) for s in plan.get("stories", []) for t in s.get("tasks", [])]
    try:
        for story, child in create_tasks(gh, cache, pairs, ms_numbers, doc_url, tradeoffs_url, args.update):
            children.setdefault(story["key"], []).append(child)
            created.append(child)
    except ValueError as err:
        print(f"Plan has problems:\n  {err}")
        return 1

    if not args.skip_stretch:
        print("\nFuture (v2+)")
        for item in plan.get("stretch", []):
            ms = ms_numbers.get(item.get("milestone", "future"))
            created.append(create_issue(gh, cache, item["title"], story_body(item, doc_url), item["labels"], ms,
                                        item.get("previous_titles"), args.update, item.get("remove_labels")))

    print("\nSub-issue links")
    real_parents = [p["number"] for p in parents.values() if p["number"] < FAKE_NUMBER_START]
    linked = existing_links(gh, real_parents)
    for key, kids in children.items():
        for child in kids:
            link_sub_issue(gh, parents[key], child, linked)
    print(f"  {gh.stats['links new']} new links, {sum(len(k) for k in children.values())} ensured")

    if args.project:
        ensure_project(gh, args.project, created)

    s = gh.stats
    print(f"\nDone{' (dry run, nothing written)' if args.dry_run else ''}: "
          f"{s['new']} new, {s['updated']} updated, {s['unchanged']} unchanged, {s['reused']} reused issues; "
          f"{s['links new']} new links; {s['milestones renamed']} milestones renamed, "
          f"{s['milestones new']} new")
    return 0


if __name__ == "__main__":
    sys.exit(main())
