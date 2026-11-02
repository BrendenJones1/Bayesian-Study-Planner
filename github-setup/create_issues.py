#!/usr/bin/env python3
"""Create labels, milestones, user-story issues, linked sub-issues and a
Project board from issues.yaml, using the GitHub CLI (gh).

Usage
  python create_issues.py --repo OWNER/REPO --dry-run
  python create_issues.py --repo OWNER/REPO --project "Bayesian Study Planner"
  python create_issues.py --repo OWNER/REPO --update   # push edited titles/bodies to existing issues

Requirements
  - gh installed and logged in:   gh auth login
  - for --project, add the scope:  gh auth refresh -s project
  - PyYAML:                        pip install pyyaml

Safe to re-run: existing labels are updated, existing milestones and
issues (matched by title or any `previous_titles`) are reused, and existing
sub-issue links are skipped. With --update, existing issues also get the
current title, body and milestone from issues.yaml; their labels are merged
(labels you added by hand are kept).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent


# ----------------------------------------------------------------- gh helpers
class GH:
    def __init__(self, repo: str, dry_run: bool):
        self.repo = repo
        self.dry = dry_run
        self._fake_number = 1000

    def run(self, args: list[str], stdin: str | None = None, read_only: bool = False) -> str:
        cmd = ["gh", *args]
        if self.dry and not read_only:
            print("  [dry-run] " + " ".join(_shorten(a) for a in cmd))
            return ""
        if self.dry and read_only:
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


def task_body(task: dict, story: dict, doc_url: str, tradeoffs_url: str = "") -> str:
    lines = [f"Part of **{story['title']}**.", "", f"> {story['story']}", ""]
    if task.get("context"):
        ctx = task["context"].strip()
        if tradeoffs_url and "decision" in ctx.lower():
            ctx += f" Rationale: [Design tradeoffs]({tradeoffs_url})."
        lines += [ctx, ""]
    lines.append("### Acceptance criteria")
    lines += [f"- [ ] {c}" for c in task.get("criteria", [])]
    lines += ["", f"Design doc: [{story.get('design_section', 'System design')}]({doc_url})"]
    if story.get("research"):
        lines.append(f"Research basis: {story['research']}")
    if "claude-ready" in task.get("labels", []):
            lines += ["", ("_Agent note: follow CLAUDE.md. Open a draft PR whose body starts with "
                "`Closes #<this issue>` and shows how each criterion was verified._")]
    return "\n".join(lines)


# ----------------------------------------------------------------- main steps
def ensure_labels(gh: GH, labels: list[dict]) -> None:
    print(f"\nLabels ({len(labels)})")
    for lb in labels:
        gh.run(["label", "create", lb["name"], "--color", lb["color"],
                "--description", lb.get("description", ""), "--force", "--repo", gh.repo])
        if not gh.dry:
            print(f"  ok  {lb['name']}")


def ensure_milestones(gh: GH, milestones: list[dict]) -> dict[str, int]:
    print(f"\nMilestones ({len(milestones)})")
    existing = {m["title"]: m["number"] for m in gh.paginate(f"repos/{gh.repo}/milestones?state=all&per_page=100")}
    numbers: dict[str, int] = {}
    for i, ms in enumerate(milestones, start=1):
        if ms["title"] in existing:
            numbers[ms["key"]] = existing[ms["title"]]
            print(f"  reuse  {ms['title']}")
            continue
        payload = {"title": ms["title"], "description": ms.get("description", "")}
        if ms.get("due_on"):
            payload["due_on"] = ms["due_on"]
        res = gh.api("POST", f"repos/{gh.repo}/milestones", payload)
        numbers[ms["key"]] = res["number"] if res else i
        if not gh.dry:
            print(f"  new    {ms['title']}")
    return numbers


def existing_issues(gh: GH) -> dict[str, dict]:
    items = gh.paginate(f"repos/{gh.repo}/issues?state=all&per_page=100")
    return {it["title"]: it for it in items if "pull_request" not in it}


def create_issue(gh: GH, cache: dict[str, dict], title: str, body: str,
                 labels: list[str], milestone: int | None,
                 previous_titles: list[str] | None = None, update: bool = False) -> dict:
    existing = cache.get(title)
    if existing is None:
        for old in previous_titles or []:
            if old in cache:
                existing = cache[old]
                break
    if existing is not None:
        if not update:
            print(f"  reuse  #{existing['number']} {existing['title']}")
            return existing
        current = [lb["name"] if isinstance(lb, dict) else lb for lb in existing.get("labels", [])]
        merged = list(dict.fromkeys(current + labels))
        payload = {"title": title, "body": body, "labels": merged}
        if milestone is not None:
            payload["milestone"] = milestone
        res = gh.api("PATCH", f"repos/{gh.repo}/issues/{existing['number']}", payload)
        updated = res if res else {**existing, "title": title}
        cache[title] = updated
        renamed = f" (was: {existing['title']})" if existing["title"] != title else ""
        print(f"  update #{existing['number']} {title}{renamed}")
        return updated
    payload = {"title": title, "body": body, "labels": labels}
    if milestone is not None:
        payload["milestone"] = milestone
    res = gh.api("POST", f"repos/{gh.repo}/issues", payload)
    issue = res if res else gh.fake_issue(title)
    cache[title] = issue
    print(f"  new    #{issue['number']} {title}")
    return issue


def link_sub_issue(gh: GH, parent: dict, child: dict, linked: set[tuple[int, int]]) -> None:
    key = (parent["number"], child["number"])
    if key in linked:
        return
    try:
        gh.api("POST", f"repos/{gh.repo}/issues/{parent['number']}/sub_issues",
               {"sub_issue_id": child["id"]})
    except RuntimeError as err:
        if "already" in str(err).lower() or "duplicate" in str(err).lower():
            return
        raise
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

    plan = yaml.safe_load(Path(args.plan).read_text())
    errs = validate(plan)
    if errs:
        print("Plan has problems:\n  " + "\n  ".join(errs))
        return 1

    gh = GH(args.repo, args.dry_run)
    doc_url = plan.get("design_doc_url", "")
    tradeoffs_url = plan.get("tradeoffs_doc_url", "")

    ensure_labels(gh, plan["labels"])
    ms_numbers = ensure_milestones(gh, plan["milestones"])
    cache = existing_issues(gh)
    created: list[dict] = []
    parents: list[tuple[dict, list[dict]]] = []

    groups = [("User stories", plan.get("stories", []))]
    if not args.skip_stretch:
        groups.append(("Future (v2+)", plan.get("stretch", [])))

    for heading, stories in groups:
        print(f"\n{heading}")
        for story in stories:
            ms = ms_numbers.get(story.get("milestone", "future"))
            parent = create_issue(gh, cache, story["title"], story_body(story, doc_url), story["labels"], ms,
                                  story.get("previous_titles"), args.update)
            created.append(parent)
            children = []
            for task in story.get("tasks", []):
                t_ms = ms_numbers.get(task.get("milestone", story.get("milestone", "future")))
                child = create_issue(gh, cache, task["title"], task_body(task, story, doc_url, tradeoffs_url),
                                     task["labels"], t_ms, task.get("previous_titles"), args.update)
                created.append(child)
                children.append(child)
            parents.append((parent, children))

    print("\nSub-issue links")
    linked = set() if gh.dry else existing_links(gh, [p["number"] for p, _ in parents])
    n_links = 0
    for parent, children in parents:
        for child in children:
            link_sub_issue(gh, parent, child, linked)
            n_links += 1
    print(f"  {n_links} links ensured")

    if args.project:
        ensure_project(gh, args.project, created)

    stories = len(plan.get("stories", []))
    tasks = sum(len(s.get("tasks", [])) for s in plan.get("stories", []))
    stretch = 0 if args.skip_stretch else len(plan.get("stretch", []))
    print(f"\nDone: {stories} stories, {tasks} sub-issues, {stretch} stretch issues"
          + (" (dry run, nothing created)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
