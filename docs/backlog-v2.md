# Backlog for v2

Generated from `github-setup/issues-v2.yaml` and the open issues on 3 Nov 2026. Nothing here has been applied.
Actions: **keep** (not in the plan, untouched) · **rewrite in place** (`--update` retitles and rewrites the same issue) · **close-as-future** · **close-as-obsolete**.

## 1. Every open issue

| # | Current title | Action | New title and milestone, or reason |
| --- | --- | --- | --- |
| #1 | Story: Repo, CI and automation are ready for agent-assisted work | keep | Story complete, all sub-issues closed. Closed in Phase 2 step 4. |
| #6 | Story: My Canvas data loads automatically | rewrite in place | (title unchanged) · Week 9 – Foundations and Canvas loader. |
| #12 | Spike: concluded courses and the score-statistics threshold at UBCO | keep | Still needed: past terms for the personal replay; hidden class statistics weaken Perf. |
| #13 | Story: Pressing Start studying logs my time | keep | Story: the timer feeds Study so far. |
| #18 | Ship the logging MVP to me and friends (load unpacked) with consent notes | keep | Real term data still feeds the replay and the offset. |
| #19 | Story: Predictions make sense from day one | rewrite in place | (title unchanged) · Week 10 – CSV builders and CPTs. |
| #20 | Ingest UBC Grades (UBCO) into a cached course and instructor table | rewrite in place | → **Build the UBC grade map from PAIR CSVs** · Week 10 – CSV builders and CPTs. |
| #21 | Ingest OULAD and derive study dose, study days and lead time per assessment | rewrite in place | → **Build the OULAD CSVs with the leakage rules** · Week 10 – CSV builders and CPTs. |
| #22 | Fit the population model in PyMC (zero-and-one inflated beta for all graded items) | close-as-future | PyMC zero-and-one inflated beta fit: the v1 hierarchical model: parked in design-v2 §Out of scope. |
| #23 | Publish priors.json to GitHub Pages nightly | rewrite in place | → **Publish cpts.json and fetch it in the extension** · Week 10 – CSV builders and CPTs. |
| #24 | Story: My predictions update after every grade | rewrite in place | → **Story: My predictions adapt to my own graded work** · Week 12 – Offset, planner and calendar. |
| #25 | Laplace-approximation update for theta, u and v in TypeScript | close-as-future | Laplace update of theta, u, v in the browser: parked in design-v2 §Out of scope. |
| #26 | Golden-vector parity tests between Python and TypeScript | rewrite in place | → **TypeScript exact inference with parity tests against pgmpy** · Week 11 – Network and inference. |
| #27 | Posterior predictive P(score >= target) for a candidate plan | rewrite in place | → **Grade query: P(grade >= target) for each action** · Week 11 – Network and inference. |
| #28 | Freeze predictions before each grade is released | rewrite in place | → **Store the baseline's predicted decile before each due date** · Week 12 – Offset, planner and calendar. |
| #29 | Story: Quiz me on a module from my own course files | close-as-future | Quiz story: parked in design-v2 §Out of scope. |
| #30 | Extract text from module files into ~300-word key-concept blocks | close-as-future | Quiz: text extraction: parked in design-v2 §Out of scope. |
| #31 | Gemini Nano availability check and fallback chain | close-as-future | Quiz: Gemini Nano check: parked in design-v2 §Out of scope. |
| #32 | Question generation prompt with a strict JSON schema | close-as-future | Quiz: question generation: parked in design-v2 §Out of scope. |
| #33 | Self-check filter and Report question button | close-as-future | Quiz: self-check filter: parked in design-v2 §Out of scope. |
| #34 | Quiz UI and feeding answers into the model | close-as-future | Quiz: UI and model feed: parked in design-v2 §Out of scope. |
| #35 | One-time AI-policy notice before the first quiz | close-as-future | Quiz: AI-policy notice: parked in design-v2 §Out of scope. |
| #36 | Story: Exam coverage is detected for me | rewrite in place | (title unchanged) · Week 11 – Network and inference. |
| #37 | Map items to modules from Canvas module items | rewrite in place | → **Coverage rule: an exam covers the modules released since the previous exam** · Week 11 – Network and inference. |
| #38 | On-device extraction of coverage from announcements and the syllabus | rewrite in place | → **Propose exam dates and coverage from syllabus and announcement text** · Week 11 – Network and inference. |
| #39 | Confirm or edit the proposed mapping in one click | keep | Matches 'every guess is one click to confirm or edit'. |
| #40 | Story: One plan across all my courses that respects when I'm busy | rewrite in place | → **Story: A nightly plan across all my courses that fits my calendar** · Week 12 – Offset, planner and calendar. |
| #41 | Weekly availability and busy blocks | rewrite in place | → **Manual availability: weekly hours, busy blocks, study window and daily maximum** · Week 12 – Offset, planner and calendar. |
| #42 | Joint allocator: exact convex solver with per-course and per-day caps | close-as-future | Convex multi-day planner: parked in design-v2 §Out of scope. |
| #43 | Greedy heuristic for 'what now', tested against the exact solver | close-as-obsolete | Greedy heuristic: design-v2 Decision ('Why not greedy') rejects it; replaced by the exhaustive search. |
| #44 | Crunch detection and explicit tradeoffs | rewrite in place | → **Stretch: Crunch warning, the latest start day that still clears the target** · Future (v2+). Moves to Future as a stretch item and loses `claude-ready`. |
| #45 | Thompson-sampled 'what now' on Start studying | close-as-future | Thompson-sampled 'what now': parked in design-v2 §Out of scope. |
| #46 | Start-date curve: P(score >= target) by start date in the popup | rewrite in place | → **Stretch: Start-date chart in the popup** · Future (v2+). Moves to Future as a stretch item and loses `claude-ready`. |
| #47 | Story: The report's claims are backed by held-out evidence | rewrite in place | (title unchanged) · Week 13 – Evaluation and video. |
| #48 | PSIS-LOO comparison of the six candidate models on OULAD | close-as-obsolete | PSIS-LOO of the six v1 PyMC models: v2 evaluates by held-out log-loss and the three-model ladder. |
| #49 | UBC Grades temporal holdout for course and instructor baselines | rewrite in place | → **UBC grade-map stability holdout** · Week 13 – Evaluation and video. |
| #50 | Prospective calibration on pilot exports | rewrite in place | → **Personal replay on my own Canvas term** · Week 13 – Evaluation and video. |
| #51 | Hand-check a sample of generated quiz questions | close-as-future | Hand-check of generated quiz questions: parked in design-v2 §Out of scope. |
| #52 | Headline test: quiz accuracy vs study hours as exam predictors | close-as-future | Quiz accuracy vs study hours headline test: parked in design-v2 §Out of scope. |
| #53 | Planner simulation: cram vs spaced vs planner | rewrite in place | → **Personas: four simulated students across lambda and theta** · Week 13 – Evaluation and video. |
| #54 | Story: Presentation video is submitted | rewrite in place | (title unchanged) · Week 13 – Evaluation and video. Only the design-doc link changes. |
| #55 | Script and slides for the presentation | rewrite in place | (title unchanged) · Week 13 – Evaluation and video. |
| #56 | Record and submit the video | keep | Record and submit the video. |
| #57 | Story: Final deliverables are submitted | rewrite in place | (title unchanged) · Week 14 – Final deliverables. Only the design-doc link changes. |
| #58 | Final report with research basis, evaluation and limitations | rewrite in place | (title unchanged) · Week 14 – Final deliverables. |
| #59 | README: install, privacy model, architecture, how to run the priors job | rewrite in place | → **README: install, privacy model, architecture, how to rebuild cpts.json** · Week 14 – Final deliverables. |
| #60 | Package the extension (zip) and tag v1.0 | keep | Packaging is unchanged. Consider the tag name (v1.0.0 vs v2). |
| #61 | Stretch: Calendar import (free/busy only) | rewrite in place | → **Read tomorrow's available hours from Google Calendar free/busy** · Week 12 – Offset, planner and calendar. |
| #62 | Stretch: Shared class question bank (requires instructor buy-in) | keep | Already parked in Future (v2+); not in the plan. |
| #63 | Stretch: Redis cache for the shared question bank | keep | Already parked in Future (v2+); not in the plan. |
| #64 | Stretch: End-of-term data donation and yearly priors release | keep | Already parked in Future (v2+); not in the plan. |
| #65 | Stretch: Optional sleep and wellbeing inputs | keep | Already parked in Future (v2+); not in the plan. |
| #66 | Stretch: Higher-quality quizzes with the student's own API key | keep | Already parked in Future (v2+); not in the plan. |
| #67 | Stretch: Differential privacy on donated aggregates | keep | Already parked in Future (v2+); not in the plan. |
| #68 | Stretch: Chrome Web Store listing | keep | Already parked in Future (v2+); not in the plan. |
| #69 | Stretch: Support other Canvas schools | keep | Already parked in Future (v2+); not in the plan. |
| #78 | Show the grades the model used, with bonus and dropped-item flags | keep | Perf depends on those items; the view shows what the model used. |

Totals: 57 open issues. 16 keep, 26 rewrite in place, 13 close-as-future, 2 close-as-obsolete.

## 2. New issues to create

`depends_on` becomes a `Depends on #N` line at the top of the body. Gap ids are from `docs/salvage-audit.md` §4.

| New issue | Milestone | Gap | Labels worth noting | depends_on |
| --- | --- | --- | --- | --- |
| **Story:** The repo, rules and data are ready for v2 | Week 9 – Foundations and Canvas loader |  | priority:p1 | none |
| Rewrite CLAUDE.md for v2 | Week 9 – Foundations and Canvas loader |  | priority:p1, needs-human | none |
| Write the v2 decision log (docs/tradeoffs-v2.md) | Week 9 – Foundations and Canvas loader | G23 | claude-ready | none |
| Check dataset licences and record attribution | Week 9 – Foundations and Canvas loader | G24 | needs-human | none |
| Apply the v2 workflow and CI guardrail changes | Week 9 – Foundations and Canvas loader |  | priority:p1, needs-human | none |
| Replace the priors nightly workflow with publish-on-change | Week 10 – CSV builders and CPTs | G22 | priority:p1, needs-human | Publish cpts.json and fetch it in the extension |
| Keep late, missing and excused status on every Canvas submission | Week 9 – Foundations and Canvas loader | G13 | claude-ready | none |
| Load assignment-group names and split group weights across their items | Week 9 – Foundations and Canvas loader | G11 | claude-ready | none |
| Load calendar events, syllabus text and announcements | Week 9 – Foundations and Canvas loader | G10 | claude-ready | none |
| Load concluded courses for the personal replay | Week 12 – Offset, planner and calendar |  | claude-ready | Spike: concluded courses and the score-statistics threshold at UBCO |
| Build the StudentLife stress CSVs | Week 10 – CSV builders and CPTs | G3 | priority:p1, claude-ready | Check dataset licences and record attribution |
| Learn Laplace-smoothed CPTs and write cpts.json | Week 10 – CSV builders and CPTs | G4 | priority:p1, claude-ready | Build the OULAD CSVs with the leakage rules; Build the UBC grade map from PAIR CSVs; Build the StudentLife stress CSVs |
| Write the hand-built CPTs with explanations | Week 10 – CSV builders and CPTs | G5 | priority:p1, claude-ready | Learn Laplace-smoothed CPTs and write cpts.json |
| **Story:** My chance of a grade comes from a network checked against pgmpy | Week 11 – Network and inference |  | priority:p1 | none |
| pgmpy notebook: build the network from cpts.json and answer every query | Week 11 – Network and inference | G6 | priority:p1, claude-ready | Learn Laplace-smoothed CPTs and write cpts.json; Write the hand-built CPTs with explanations |
| Perf, mastery and concept difficulty from Canvas score statistics | Week 11 – Network and inference | G9 | claude-ready | Coverage rule: an exam covers the modules released since the previous exam; Build the UBC grade map from PAIR CSVs |
| Item-weight and Graded-so-far evidence, with achievable-grade bounds | Week 11 – Network and inference | G11 | claude-ready | Load assignment-group names and split group weights across their items; TypeScript exact inference with parity tests against pgmpy |
| Encode Study so far, Timeliness and Days left as network evidence | Week 11 – Network and inference | G13 | claude-ready | Learn Laplace-smoothed CPTs and write cpts.json; Keep late, missing and excused status on every Canvas submission |
| Back-test the personal offset and choose m | Week 12 – Offset, planner and calendar | G8 | claude-ready | pgmpy notebook: build the network from cpts.json and answer every query; Build the OULAD CSVs with the leakage rules |
| Personal offset in the extension: recount per grade and shift exam standing | Week 12 – Offset, planner and calendar | G8 | claude-ready | Store the baseline's predicted decile before each due date; Back-test the personal offset and choose m; TypeScript exact inference with parity tests against pgmpy |
| Show the baseline and personalized models side by side | Week 12 – Offset, planner and calendar | G18 | claude-ready | Personal offset in the extension: recount per grade and shift exam standing |
| Load and stress: Load evidence and the Stress queries | Week 12 – Offset, planner and calendar | G12 | claude-ready | Build the StudentLife stress CSVs; Learn Laplace-smoothed CPTs and write cpts.json; TypeScript exact inference with parity tests against pgmpy |
| Utility with lambda presets | Week 12 – Offset, planner and calendar | G15 | claude-ready | Grade query: P(grade >= target) for each action; Load and stress: Load evidence and the Stress queries |
| Exhaustive plan search with one shared stress term | Week 12 – Offset, planner and calendar | G14 | claude-ready | Manual availability: weekly hours, busy blocks, study window and daily maximum; Utility with lambda presets; Grade query: P(grade >= target) for each action |
| **Story:** My study blocks appear on my calendar | Week 12 – Offset, planner and calendar |  | priority:p1 | none |
| Write study blocks to Google Calendar, with an .ics fallback | Week 12 – Offset, planner and calendar | G16 | claude-ready | Read tomorrow's available hours from Google Calendar free/busy; Exhaustive plan search with one shared stress term |
| Nightly job: recompute when a new grade appears | Week 12 – Offset, planner and calendar | G17 | claude-ready | Personal offset in the extension: recount per grade and shift exam standing; Exhaustive plan search with one shared stress term; Read tomorrow's available hours from Google Calendar free/busy |
| Held-out OULAD evaluation against the course-history-only model | Week 13 – Evaluation and video | G20 | priority:p1, claude-ready | pgmpy notebook: build the network from cpts.json and answer every query; Build the OULAD CSVs with the leakage rules; Build the StudentLife stress CSVs |
| Three-model ladder: course history only, baseline, baseline plus offset | Week 13 – Evaluation and video | G20 | priority:p1, claude-ready | Back-test the personal offset and choose m; Held-out OULAD evaluation against the course-history-only model |
| Assumed numbers in one module, with a sensitivity sweep for each | Week 13 – Evaluation and video | G21 | priority:p1, claude-ready | Utility with lambda presets; Perf, mastery and concept difficulty from Canvas score statistics; Exhaustive plan search with one shared stress term |

3 new stories and 27 new tasks. Rewritten issues keep their numbers, so their `depends_on` lines refer to the existing numbers.

## 3. Milestones

Renamed in place (same milestone numbers, so every issue keeps its milestone). The due dates are the same ones the v1 plan used, so re-dating changes nothing.

| Old title | New title | Due |
| --- | --- | --- |
| Week 9 – Logging MVP | Week 9 – Foundations and Canvas loader | Fri 06 Nov 23:59 PST (2026-11-07T07:59:00Z) |
| Week 10 – Model v1 (midterm break) | Week 10 – CSV builders and CPTs | Fri 13 Nov 23:59 PST (2026-11-14T07:59:00Z) |
| Week 11 – Quizzes and planner | Week 11 – Network and inference | Fri 20 Nov 23:59 PST (2026-11-21T07:59:00Z) |
| Week 12 – Evaluation | Week 12 – Offset, planner and calendar | Fri 27 Nov 23:59 PST (2026-11-28T07:59:00Z) |
| Week 13 – Presentation video | Week 13 – Evaluation and video | Fri 04 Dec 23:59 PST (2026-12-05T07:59:00Z) |
| unchanged | Week 14 – Final deliverables | Fri 11 Dec 23:59 PST (2026-12-12T07:59:00Z) |
| unchanged | Future (v2+) | none |

## 4. Decisions made in the plan

Each is a guess where the v2 design is silent. Change it in `issues-v2.yaml` and re-run the dry run if you disagree.

- **Priorities.** `priority:p1` on G1–G7, G19–G21, the report and the video, as asked. Rewritten issues keep the priority they had (so #27, #28, #37, #41 stay p1). Everything else new is p2, including G8 (the offset, which the design calls the main result), G9, G11, G14 and G16. Say if you want any of those p1.
- **Major project.** The loader task treats an item as a major project when its group name matches project, paper or essay and its share is over 15%. v2 says only exams and major projects get study blocks but does not define a major project.
- **Module release date.** The coverage rule counts a module as released on its `unlock_at` date, else by module order.
- **λ presets.** Grades first 0.1, Balanced 0.4 (the design's worked example), Wellbeing first 1.0. The design gives only the example value and the threshold 0.16.
- **'Tagged' calendar blocks.** The design says the planner's own blocks are tagged and not counted busy, but Google's free/busy returns no event details. The calendar-write task resolves this by recording each written block locally (`planned_blocks`) and subtracting those intervals. This is a gap in design-v2 worth a sentence there.
- **Dependencies on human tasks.** The Google Calendar read task depends on the workflow-change task, because the CI host guardrail rejects `googleapis.com` until a human edits `ci.yml`.
- **Stories #54 and #57** are in the plan only so that #55, #58 and #59 can be rewritten in place; their bodies change by the design-doc link.
- **G13 is split.** The loader half (late/missing/excused) is Week 9; the evidence encoders need cpts.json cut points, so they are Week 11. G11 is split the same way (loader Week 9, evidence and bounds Week 11). The Grade query (#27) and the coverage rule (#37) are Week 11, which your list did not name.

## 5. Notes for Phase 2

- **Milestones are renamed by the script,** not by separate API calls: each plan milestone lists `previous_titles`, and `create_issues.py` PATCHes the matching milestone. Same effect, and the dry run shows it.
- **Re-parenting.** #26 and #27 move from story #24 to the new network story (`replace_parent`). #44 and #46 become stretch items but stay linked under story #40; unlink them by hand if you do not want them there.
- **Labels.** The plan's `priority:`, `type:` and `area:` labels replace the old ones, so #61 becomes `type:task`, #53 becomes `priority:p1`, and #36 and #38 lose `area:quiz`. Hand-added labels are kept. #44 and #46 lose `claude-ready` through `remove_labels`.
- **Merge this PR first.** The new `claude-ready` issues start with no open dependencies (the loader tasks, the licence check). If the nightly agent is on, it would pick them up under the old CLAUDE.md, which still lists the ZOIB invariants and has no 'Depends on' stop rule.
- **Workflows.** Nothing here edits `.github/workflows/`. The workflow changes are the two `needs-human` issues in section 2.

