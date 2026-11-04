# Salvage audit: v1 → v2

Read-only audit, 3 Nov 2026. Nothing was edited, opened, closed or relabelled except this file.

**Scope.** `origin/main` at `6834633` (your local checkout is 22 commits behind, so I read from `origin/main`), plus open PRs #81 and #83 and all 59 open issues. The v2 design is `docs/design v2.md` (untracked, with a space in the name; CLAUDE.md and the workflows will need a stable name such as `docs/design-v2.md`).

**Classes.**

| Class | Meaning |
| --- | --- |
| KEEP | Works under v2 unchanged. |
| ADAPT | Keep, with the listed changes. |
| FUTURE | v1-only capability that v2 §Out of scope names or that we may revive. Park it. |
| REMOVE | Dead under v2: a v2 decision replaces it. |
| REWRITE | Issues only: same intent, new criteria. |
| CLOSE-AS-FUTURE / CLOSE-AS-OBSOLETE | Issues only: FUTURE vs REMOVE above. |

**Headline findings.**

1. **Less is built than the issue count suggests.** `extension/src/model/`, `planner/` and `quiz/` and all four `priors/` modules are empty placeholders. What exists is the Canvas client and loader, IndexedDB, the timer/session code and the popup shell. Almost all of it survives.
2. **The v1 modeling issues are all unbuilt**, so dropping them costs nothing. No PyMC, ZOIB, Laplace or convex-planner code exists to delete.
3. **Priors nightly is already failing** (run 41682987391: `No module named priors.publish`; the package is `bsp_priors`). It would also be the wrong shape for v2, because learning happens once from committed CSVs and does not need a nightly cron.
4. **The nightly Claude agent is still enabled** (`ENABLE_CLAUDE_NIGHTLY=true`) and its prompt reads `docs/design.md` and the v1 CLAUDE.md invariants. Until CLAUDE.md and the issues are triaged, it can pick a `claude-ready` v1 issue such as #22 (ZOIB fit) and build it.
5. **v2 conflicts with CLAUDE.md rule 2.** v2 §Decision allows writing blocks to "Canvas's personal calendar if Google isn't connected", which is a Canvas POST. See §5.

---

## 1. Code and infrastructure inventory

| Area | Files | Class | v2 section | Reason and required changes |
| --- | --- | --- | --- | --- |
| Canvas client | `extension/src/canvas/client.ts`, `client.test.ts` | **KEEP** | Architecture step 5 (GET only) | GET-only by construction, Link-header pagination, retry/backoff on 429/5xx, auth errors surfaced, refuses non-Canvas URLs. Google Calendar must **not** go through it: the `BASE` guard is a feature. Add a separate `extension/src/calendar/` client. |
| Canvas loader | `canvas/load.ts`, `load.test.ts` | **ADAPT** | Data sources; Network (Perf, Timeliness, Item weight, Graded so far) | Core is right: courses, modules, assignments, own submissions, `lead_days`, six score-statistics fields stored as null when hidden. Changes: **(a)** `Submission` drops `missing` items entirely and never stores `late`, `missing` or `seconds_late`; v2 Timeliness needs all three, so keep a timeliness record for items excluded from scoring. **(b)** `Item.weight` is the raw `group_weight` (the group's share), but v2 Item weight is the item's share: split the group weight across the group's items, with a points-share fallback when the course has no weighted groups. **(c)** Store `assignment_group` name and id: v2 types items from group names (exam, midterm, quiz, assignment, lab; only exams and major projects get blocks), and the current `type` is a name regex into `"exam" \| "assignment"` (the code comment already calls it a shortcut). **(d)** Load calendar events (`/calendar_events`), course `syllabus_body`, and announcements, for exam dates and coverage. **(e)** Optionally load concluded courses (`enrollment_state=completed`) for the personal replay; blocked on spike #12. **(f)** `normalizeScore` comment and test names cite v1 "design doc, Score validation" and the ZOIB rationale; the behaviour (no epsilon, >1 capped, excused/ungraded dropped) is harmless under v2. Retitle only. |
| Undated-date popup | `canvas/undated.ts`, `undated.test.tsx`, `ui/Undated.tsx` | **KEEP** | Data sources, "Exam dates, coverage and weights" (every guess one click) | Already the one-click confirm path, persisted to `course_cache` and surviving reloads. Syllabus and announcement proposals (gap) reuse `confirmDueAt`. |
| Storage layer | `storage/db.ts`, `db.test.ts` | **ADAPT** | Architecture; Personal offset; Decision | Typed wrappers and append-only `MIGRATIONS` are right; v2 only appends a migration. **Drop:** `posterior` (θ, u, v: v1 Laplace), `quiz_item`, `quiz_answer` (quizzes are FUTURE). **Rework:** `frozen_prediction` (v1: P and interval) becomes the baseline's predicted decile distribution per item before its due date; that is exactly what the offset residual needs, so keep the store but change the type. `availability` gains study window, daily max M (default 6, min 5), and the λ preset. **Add:** `offset_counts` (N_you(k) for k = −2..+2, plus one record per graded item so a recompute counts each item once), `cpts_cache` (the fetched `cpts.json` with version, fetched_at, ETag), `calendar_settings` (source: Google or manual, connected flag, calendar id), `planned_blocks` (event ids and tags, so the planner's own blocks aren't counted busy and can be replaced idempotently). Update the store-name assertions in `db.test.ts`. No pilot data has shipped (#18 is open), so deleting v1 stores in migration 2 is low-risk. |
| Timer and sessions | `timer/sessions.ts`, `sessions.test.tsx`, `ui/Sessions.tsx` | **KEEP** | Data sources (timer: minutes per course per day, optional) | Edit and delete over `study_session`. Needs only the aggregation v2 uses (minutes per course per day → Study so far buckets), which is new work, not a change. |
| Popup shell | `ui/App.tsx`, `ui/main.tsx` | **KEEP** | n/a | Wiring pattern is fine. v2 adds screens (both models side by side, plan, settings); none of the current props conflict. |
| Manifest and its test | `public/manifest.json`, `src/manifest.test.ts` | **ADAPT** | Architecture; Decision | The test asserts `host_permissions` is exactly `canvas.ubc.ca` and "requests no API permissions". v2 needs `idle` (PR #81), `alarms` (nightly job), `identity` plus an `oauth2` block (Google sign-in), a host entry for `www.googleapis.com/calendar/v3/*`, and a fetch of `cpts.json` from GitHub Pages. Update the test to the new exact allowlist; do not loosen it to wildcards. |
| Extension build and lint config | `eslint.config.js`, `vite.config.ts`, `tsconfig.json`, `package.json`, `popup.html`, `ci.test.ts` | **KEEP** | n/a | Stack-neutral. |
| Model, planner, quiz dirs | `extension/src/model/.gitkeep`, `planner/.gitkeep`, `quiz/.gitkeep` | **ADAPT** (model, planner) / **FUTURE** (quiz) | Prediction; Decision / Out of scope | `model/` holds exact enumeration and the offset; `planner/` holds the exhaustive 3^n search. Remove the `quiz/` placeholder, or keep it empty until quizzes return; `shared/tests/test_repo_layout.py` asserts it exists. Add `calendar/`. |
| Priors package: ingest | `priors/bsp_priors/ingest_oulad.py`, `ingest_ubcgrades.py` | **ADAPT** (rename and rewrite; both are 1-line placeholders) | Learning the CPTs; Data sources | Become CSV builders: `oulad_*.csv` with the leakage rules, UBC PAIR → year-averaged decile grade map. Add a StudentLife builder. |
| Priors package: fit and publish | `bsp_priors/fit.py`, `publish.py` | **ADAPT** | Learning the CPTs; Architecture step 4 | `fit.py` (PyMC) becomes Laplace-smoothed counting; `publish.py` writes `cpts.json`. `pyproject.toml` has `dependencies = []`, so v2 needs pandas, numpy (and pgmpy in `eval/`). PyMC and ArviZ are no longer needed. |
| Eval package | `eval/` (README, `bsp_eval`, test) | **KEEP** (package) / **ADAPT** (README) | Evaluation | The empty package fits the v2 notebooks. README text lists v1 notebooks (LOO, quiz validation). |
| Shared fixtures | `shared/fixtures/README.md`, `shared/tests/test_repo_layout.py` | **ADAPT** | Architecture step 5 | README: golden vectors are now variable-elimination parity (pgmpy vs TypeScript enumeration) and CPT-learning vectors, not Laplace posteriors. The layout test must drop `quiz`, rename modules, and expect `cpts.json`. |
| Local CI | `scripts/ci-local.sh`, `requirements-dev.txt` | **KEEP** / **ADAPT** | n/a | Mirrors `ci.yml`. Host-allowlist guardrail rejects every host except Canvas, `github.io` and localhost, so the first Google Calendar PR fails it by design; allow `googleapis.com` only under `extension/src/calendar/`. The Canvas GET-only grep only scans `src/canvas`, so Google's `freeBusy.query` (a POST) is unaffected. |
| CI workflow | `.github/workflows/ci.yml` | **KEEP** / **ADAPT** | n/a | Same guardrail change as `ci-local.sh`. Protected by rule 7: a human edit. |
| Priors nightly workflow | `.github/workflows/priors-nightly.yml` | **ADAPT** | Architecture steps 1–4 | **Broken today:** calls `python -m priors.publish`, but the package is `bsp_priors`. For v2, learning is offline from committed CSVs, so replace the cron with "publish `cpts.json` when `priors/` or the CSVs change" (plus `workflow_dispatch`). Keep the Pages deploy job. Human edit. |
| Claude workflows | `claude.yml`, `claude-nightly.yml`, `claude-review.yml` | **ADAPT** | n/a | All three read `docs/design.md` and `docs/tradeoffs.md`. `claude-review.yml` lines 64–67 hard-code the v1 invariants (no logit on observed scores, soft day count, OULAD never sets the scale of beta); the reviewer will fail v2 PRs for the wrong reasons, or wave through v2 violations. Update to the v2 invariants in §5. Human edit. |
| Release workflow | `release.yml` | **KEEP** | n/a | Stack-neutral. |
| Claude settings | `.claude/settings.json` | **KEEP** | n/a | Plugins and `.env`/`.pem` deny rules unaffected. |
| Issue-plan tooling | `github-setup/create_issues.py`, `issues.yaml`, `docs/github-setup.md` | **FUTURE** (archive) | n/a | `issues.yaml` is the v1 plan. Re-running `create_issues.py` would recreate v1 issues. Archive, or regenerate from a v2 plan. |
| v1 docs | `docs/design.md`, `docs/tradeoffs.md` | **FUTURE** (keep as v1 record) | Out of scope: "see the v1 design doc" | v2 refers readers to v1 for the parked work, so keep both. `tradeoffs.md` decisions 20–25 (ZOIB, Laplace, soft day count, OULAD scale) are CLAUDE.md's cited invariants and are now dead. v2 needs its own decision log. |

---

## 2. Pull requests

| # | Title | State | Class | Reason, v2 section, files |
| --- | --- | --- | --- | --- |
| 70 | Scaffold the monorepo | Merged | **KEEP** (ADAPT layout test) | Layout still holds except `extension/src/quiz`. `shared/tests/test_repo_layout.py` pins the v1 module names. |
| 72 | Local CI script | Merged | **KEEP** | `scripts/ci-local.sh`, `requirements-dev.txt`. Host guardrail change when Calendar lands (§1). |
| 73 | CI wiring test | Merged | **KEEP** | `extension/src/ci.test.ts`. |
| 74 | Canvas API client (GET only, paginated) | Merged | **KEEP** | v2 Architecture step 5. `canvas/client.ts`. |
| 75 | Load courses, modules, items, submissions | Merged | **ADAPT** | `canvas/load.ts`: add late/missing/group name/group-split weights/calendar events/syllabus/announcements (§1). |
| 76 | Request score statistics, store all six, null when missing | Merged | **KEEP** | Directly feeds Perf (percentile from quartiles) and concept difficulty (class mean vs course mean). `canvas/load.ts`. |
| 77 | Validate and normalize scores | Merged | **ADAPT** | `canvas/load.ts`: behaviour is fine; keep `missing`/`late` for Timeliness instead of discarding the item; retitle the ZOIB-based rationale. Note: Canvas quartiles are in points and `Submission.score` is a fraction, so Perf must divide the quartiles by `Item.points` (the field exists). |
| 79 | One-click confirmation for exam dates | Merged | **KEEP** | v2 Data sources ¶1. `canvas/undated.ts`, `ui/Undated.tsx`. |
| 80 | IndexedDB storage layer | Merged | **ADAPT** | `storage/db.ts`: append migration 2; drop `posterior`, `quiz_*`; rework `frozen_prediction`; add `offset_counts`, `cpts_cache`, `calendar_settings`, `planned_blocks` (§1). |
| 82 | Edit and delete study sessions | Merged | **KEEP** | `timer/sessions.ts`, `ui/Sessions.tsx`. |
| 81 | Study timer with module picker and idle detection | Open, draft, `ci` and `requirements-review` pass | **KEEP** | v2 timer: minutes per course per day. Adds the `idle` permission and `timer/session.ts`. Module is required at start; v2 only needs course-level minutes, so make module optional in a follow-up, not a blocker. Merging as is cheaper than reworking. |
| 83 | Export my data to a single JSON file | Open, draft, `ci` and `requirements-review` pass | **KEEP** | `storage/export.ts` reads every store generically through `stores(db)`, so it follows the schema change on its own. Useful for the n=1 personal replay. Check its test doesn't pin the v1 store names. |

---

## 3. Open issues (59)

Tally: KEEP 20 (8 already parked in Future), REWRITE 24, CLOSE-AS-FUTURE 13, CLOSE-AS-OBSOLETE 2.

| # | Title | Class | What changes / reason |
| --- | --- | --- | --- |
| 1 | Story: Repo, CI and automation ready | KEEP | All children closed; close as completed. |
| 6 | Story: Canvas data loads automatically | REWRITE | Add criteria: late/missing, group names and group-split weights, calendar events, syllabus, announcements. |
| 12 | Spike: concluded courses and stats threshold | KEEP | v2 depends on both: past terms for the personal replay, and hidden stats weaken Perf. Needs human. |
| 13 | Story: Pressing Start studying logs my time | KEEP | Timer feeds Study so far. |
| 15 | Study timer with module picker | KEEP | PR #81. |
| 17 | Export my data | KEEP | PR #83. |
| 18 | Ship the logging MVP to friends | KEEP | Real term data is still what the replay and offset need. Needs human. |
| 19 | Story: Predictions make sense from day one | REWRITE | Same intent; now delivered by the CPT pipeline and baseline model, not PyMC priors. |
| 20 | Ingest UBC Grades (UBCO) | REWRITE | Source is the PAIR CSVs (UBCO 2021–25), not the API v2; output is the year-averaged decile grade map with difficulty groups (<75.3 Hard, 75.3–81 Med, 81+ Easy; <2 years uses the pooled group). Keep the course-code parser criterion. |
| 21 | Ingest OULAD: dose, study days, lead time | REWRITE | Becomes the OULAD CSV builders with the v2 leakage rules, ranks within module presentation, withdrawals excluded, held-out by student. Drop clicks-per-median dose, the soft-day criterion, and the 2013/2014 split. |
| 22 | Fit population model in PyMC (ZOIB) | CLOSE-AS-FUTURE | v2 §Out of scope parks the hierarchical model and ZOIB. |
| 23 | Publish priors.json to Pages nightly | REWRITE | Publish `cpts.json`; fix the `bsp_priors` module path; trigger on change, not nightly; keep the extension fetch/cache/stale-handling criterion. |
| 24 | Story: predictions update after every grade | REWRITE | Becomes the personal offset story (nightly recount when a new grade appears). |
| 25 | Laplace update for θ, u, v in TypeScript | CLOSE-AS-FUTURE | Named in v2 §Out of scope. |
| 26 | Golden-vector parity tests Python ↔ TypeScript | REWRITE | Parity target is now pgmpy `VariableElimination` vs TypeScript exact enumeration (and the offset update); same fixtures directory, same ≤1e-6 style tolerance. Drop PyMC/NUTS interval-coverage criterion. |
| 27 | Posterior predictive P(score ≥ target) for a plan | REWRITE | Becomes P(grade ≥ t \| e, a) per action via the network, with the achievable-grade bounds applied first. |
| 28 | Freeze predictions before each grade | REWRITE | Store the baseline's predicted decile distribution before the due date; the offset residual needs this. Drop the interval. |
| 29 | Story: Quiz me on a module | CLOSE-AS-FUTURE | Quizzes are Out of scope (a quiz-score node under each Mastery is the stated return path). |
| 30 | Extract text into ~300-word blocks | CLOSE-AS-FUTURE | Quizzes. |
| 31 | Gemini Nano availability check | CLOSE-AS-FUTURE | Quizzes. (Gemini Nano date extraction is a v2 stretch goal; open a new issue if wanted.) |
| 32 | Question generation prompt | CLOSE-AS-FUTURE | Quizzes. |
| 33 | Self-check filter and Report question | CLOSE-AS-FUTURE | Quizzes. |
| 34 | Quiz UI and feeding answers into the model | CLOSE-AS-FUTURE | Quizzes; depended on the v1 quiz likelihood. |
| 35 | One-time AI-policy notice | CLOSE-AS-FUTURE | Quizzes. |
| 36 | Story: Exam coverage is detected | REWRITE | v2 detection is pattern matching on assignments, calendar events, syllabus and announcements; no on-device LLM. |
| 37 | Map items to modules from module items | REWRITE | Item→module mapping already ships in the loader (`module_ids`, #75). Remaining work: the coverage rule (default: modules released since the previous exam) feeding concept difficulty and mastery. |
| 38 | On-device extraction from announcements and syllabus | REWRITE | Regex around "midterm / exam / final / quiz" and "Modules 4–7"; propose, never auto-apply. |
| 39 | Confirm or edit the mapping in one click | KEEP | Matches "every guess one click to confirm or edit". |
| 40 | Story: One plan across my courses | REWRITE | The plan is the nightly action per course (Intense / Light / Rest) plus calendar blocks. |
| 41 | Weekly availability and busy blocks | REWRITE | Small: add study window, daily max M (default 6, min 5), and the manual-vs-Google source setting. |
| 42 | Joint allocator: exact convex solver | CLOSE-AS-FUTURE | v2 §Out of scope parks the convex multi-day planner. |
| 43 | Greedy heuristic tested against the exact solver | CLOSE-AS-OBSOLETE | v2 §Decision "Why not greedy" rejects it; replaced by exhaustive 3^n search. |
| 44 | Crunch detection and explicit tradeoffs | REWRITE | v2: stretch "latest start day that still clears the target", plus unreachable/locked-in targets get no study time with the reason shown. |
| 45 | Thompson-sampled "what now" | CLOSE-AS-FUTURE | Named in v2 §Out of scope. |
| 46 | Start-date curve with interval band | REWRITE | v2 crunch warning: P(target \| start on day d); no interval band. Stretch. |
| 47 | Story: claims backed by held-out evidence | REWRITE | v2 Evaluation table. |
| 48 | PSIS-LOO comparison of six models on OULAD | CLOSE-AS-OBSOLETE | Compares the v1 PyMC models. v2 evaluates by held-out log-loss against the course-history-only model and the three-model ladder. |
| 49 | UBC Grades temporal holdout | REWRITE | v2 "Grade-map stability": difficulty from 2021–23, outcomes from 2024–25. |
| 50 | Prospective calibration on pilot exports | REWRITE | v2 has the personal replay (retrospective, n=1). Keep pilot exports as an optional extra. Needs human. |
| 51 | Hand-check generated quiz questions | CLOSE-AS-FUTURE | Quizzes. |
| 52 | Headline test: quiz accuracy vs study hours | CLOSE-AS-FUTURE | v2's headline result is baseline vs personalized. |
| 53 | Planner simulation: cram vs spaced vs planner | REWRITE | Personas (struggling, advanced, overloaded, far from the exam) with λ and θ swept. |
| 54 | Story: Presentation video | KEEP | |
| 55 | Script and slides | REWRITE | Small: the demo is baseline vs personalized side by side. Needs human. |
| 56 | Record and submit the video | KEEP | Needs human. |
| 57 | Story: Final deliverables | KEEP | |
| 58 | Final report | REWRITE | Rubric items: hand-worked CPT entries, sensitivity checks for the five assumptions, limitations list. Needs human. |
| 59 | README | REWRITE | Small: privacy model includes the Google Calendar exception; "run the priors job" becomes "rebuild CSVs and `cpts.json`". |
| 60 | Package the extension and tag v1.0 | KEEP | `release.yml` unaffected. Consider the tag name (v1 vs v2). |
| 61 | Stretch: Calendar import (free/busy) | REWRITE | **Promote to core.** v2 needs free/busy reads, calendar writes, Google sign-in, tagging of the planner's own blocks, and a manual fallback. |
| 62 | Stretch: Shared question bank | KEEP (parked) | Already in Future; doubly parked since quizzes are parked. |
| 63 | Stretch: Redis cache | KEEP (parked) | Blocked by #62. |
| 64 | Stretch: End-of-term data donation | KEEP (parked) | Would need a new narrow exception to rule 1. |
| 65 | Stretch: Sleep and wellbeing inputs | KEEP (parked) | v2 has no daily "feel" inputs; stays future. |
| 66 | Stretch: Quizzes with own API key | KEEP (parked) | Quizzes. |
| 67 | Stretch: Differential privacy | KEEP (parked) | |
| 68 | Stretch: Chrome Web Store listing | KEEP (parked) | Newly relevant: a public release with a Calendar scope needs Google OAuth verification. |
| 69 | Stretch: Other Canvas schools | KEEP (parked) | |
| 78 | Show the grades the model used, with bonus and dropped flags | KEEP | Still useful: Perf depends on those items. Update the doc reference from v1 "Score validation". |

---

## 4. Gaps: v2 work with no issue and no code

| # | v2 work | v2 section | Nearest existing item | Gap |
| --- | --- | --- | --- | --- |
| G1 | OULAD CSV builder with leakage rules | Learning the CPTs | #21 (v1 scope) | Rewrite #21: Perf/Study/Timeliness from earlier assessments only; per-presentation thirds and deciles; withdrawals excluded; student-level split; quintile fallback when a cell has under ~30 students. A **leakage test** (poison future rows, outputs must not change). |
| G2 | UBC PAIR ingest and year-averaged decile grade map | Prediction (Grade map) | #20 | Rewrite #20 (PAIR CSVs, not API v2); per-year decile slicing then averaging; difficulty-group pooling; Canvas code → PAIR course mapping. |
| G3 | StudentLife ingest and stress recoding | Stress; Learning the CPTs | none | New. Check answer labels against `EMA_definition.json` before recoding; build `studentlife_stress_now.csv` and `_next.csv`; derive Load cut points from `deadlines.csv` thirds. |
| G4 | CPT learning with Laplace smoothing and `cpts.json` | Learning the CPTs | #22, #23 (v1) | New. α=1 default, α sweep {0, 1, 5}; worked example 79/422 = 0.187 as a test; schema and version of `cpts.json`. |
| G5 | Hand-built CPTs with explanations | Network (Exam difficulty, Perf, Study before the exam) | none | New. Deterministic mean-and-round tables and the 27-row study rule, each with a written rationale (rubric item). |
| G6 | pgmpy notebook (variable elimination, personas, evaluation) | Architecture step 3 | none (#48 obsolete) | New, in `eval/`. Builds the network from `cpts.json`; the graded artifact. |
| G7 | TypeScript inference with parity tests | Architecture step 5 | #26 (rewrite) | New: exact enumeration over the 23-node network, golden vectors generated by pgmpy, CPT-lookup bundle, tolerance. |
| G8 | Personal offset, with back-test-chosen m | Personal offset | #24, #28 (rewrite) | New: Python back-test over m ∈ {1,2,5,10,20,50} for p₀ and m; TypeScript nightly recount, residuals vs baseline, ±2 clipping, edge-mass shift. |
| G9 | Perf and mastery from Canvas score statistics, with fallbacks | Network; Prediction (Perf) | #76 (stats stored) | New: percentile interpolation from quartiles (in points → divide by `Item.points`); weighted mean; fallback placing the score against the course's historical distribution when stats are hidden; mastery per concept; concept difficulty vs course mean (±5). |
| G10 | Exam dates and coverage from assignments, calendar events, syllabus and announcements | Data sources | #11 (done), #36–39 | Loader additions (§1) and pattern extraction with provisional proposals (#38 rewrite). |
| G11 | Item weights and achievable-grade bounds | Prediction (Bounds); Network | loader stores raw `group_weight` | New: group-split weights, `Graded so far`, `Item weight`, and the two bound tests c·G + R < t and c·G ≥ t before any inference; reason shown to the student. |
| G12 | Load and stress tables | Stress | none | New: Load today/tomorrow from deadlines in the next 3 days across courses; Stress now/next lookup; optional stress tap as evidence; θ and S(h). |
| G13 | Study before the exam, Timeliness, Days left | Network; Prediction | timer minutes exist | New: per-course-per-day aggregation → weekly volume and active-day buckets (anchor ~3 h/week/course); Timeliness from `submitted_at`/`late`/`missing`. |
| G14 | Exhaustive plan search | Decision | #42, #43 (closing) | New: 3^n search with a shared stress term S(h), subject to h ≤ H; test against brute force; worked example (H=6: MATH Light + COSC Intense = 11.2 beats greedy 9.6). |
| G15 | Utility, λ presets, settings | Decision | none | New: EU formula, λ presets (Grades first / Balanced / Wellbeing first), settings UI. |
| G16 | Google Calendar free/busy and calendar writes | Decision; Architecture | #61 (stretch) | New and larger than #61: OAuth with `chrome.identity`, manifest changes, free/busy → H = min(F, M), tagged event writes, idempotent replace, manual fallback and the "Google unreachable" path, `.ics` export. |
| G17 | Nightly job | Architecture step 6 | none | New: `chrome.alarms`, service worker, recompute on new grade, re-run both models, write blocks. |
| G18 | Both models side by side in the UI | Overview; Personal offset | none | New popup screens, with "students like you" copy. |
| G19 | Personas | Evaluation | #53 (rewrite) | Four personas × λ × θ in the notebook (rubric: different concept difficulties → different actions). |
| G20 | Evaluation: held-out OULAD, three-model ladder, personal replay | Evaluation | #47–50 (v1 shaped) | New: course-history-only vs baseline vs baseline+offset; offset back-test; stress-table log-loss; α-smoothing table; replay without future leakage. |
| G21 | Assumptions table and sensitivity checks | Assumptions and limitations | none | New: the five assumed numbers (±5 threshold, 3 h anchor, 15% cut, θ, λ) in one constants module, each with its sweep. |
| G22 | Fix `priors-nightly.yml` | Architecture step 4 | #23 | Broken now (see headline 3). |
| G23 | v2 decision log | n/a | `tradeoffs.md` (v1) | New: a v2 tradeoffs doc so CLAUDE.md can cite decisions again. |
| G24 | Dataset licences and attribution | Data sources | none | New, small: OULAD is CC BY 4.0; confirm PAIR and StudentLife redistribution terms before committing derived CSVs. |

---

## 5. CLAUDE.md changes

| Item | Status | Proposed wording |
| --- | --- | --- |
| Intro and layout | Outdated | **What this is:** "A local-first Chrome extension for UBC Canvas. Each night it picks a study action (intense 5 h, light 1 h, rest) per course by comparing expected utility from a discrete Bayesian network. Full design: `docs/design-v2.md`. The v1 design (`docs/design.md`, `docs/tradeoffs.md`) is parked reference for future work only." **Layout:** `priors/` — "Python 3.12: builds one CSV per learned table from OULAD, UBC PAIR and StudentLife, learns Laplace-smoothed CPTs, publishes `cpts.json`"; `eval/` — "pgmpy notebooks: inference, personas, held-out evaluation"; `shared/fixtures/` — "golden vectors for variable-elimination parity"; add `extension/src/calendar/`; remove `quiz`. |
| Rule 1 (no data leaves) | Needs a narrow exception | "1. **No student data leaves the browser,** with one exception: the student's own Google Calendar, only after they click Connect. Allowed network calls: GET `canvas.ubc.ca/api/v1/...`; GET the published `cpts.json`; and, from `extension/src/calendar/` only, Google Calendar free/busy queries (`calendar.freebusy`) and create, update or delete of study blocks the planner itself wrote (`calendar.events`). Never read event titles or details. Event titles contain a course code and hours only, never grades, probabilities or stress. No other host." |
| Rule 2 (Canvas read-only) | Conflict with v2 §Decision | Keep as written, and say: "Calendar blocks go to Google or to an `.ics` file, never to Canvas." **Decision needed:** v2 offers "Canvas's personal calendar if Google isn't connected". That is a Canvas POST. Recommendation: drop it and use `.ics` export as the fallback; this keeps rule 2 absolute. |
| Rule 3 (quizzes on device) | Obsolete | Move to a "Parked v1 rules" section, restoring it if quizzes return. |
| Rule 4 (model math must match) | Reword | "4. **Inference must match.** `extension/src/model/` (exact enumeration) must reproduce pgmpy `VariableElimination` from `eval/` on every vector in `shared/fixtures/`. Only `priors/` turns counts into probabilities; the extension never re-estimates a population CPT. Any change to a CPT, the structure or the offset formula updates `shared/fixtures/` and passes both suites." |
| Rule 5 (model invariants) | **Obsolete**: ZOIB/logit, soft day count, OULAD scale of beta | Replace the three bullets with: **a. Laplace smoothing.** "Every learned CPT is (N(x,u)+α)/(N(u)+α·\|X\|) with α = 1; no shipped table has a zero entry." **b. No leakage.** "Perf, Study and Timeliness for an assessment use only data dated before it; the outcome uses that assessment or the final result only. Held-out splits are by student, never by row." **c. Ranks within class.** "Thirds and deciles are computed per module presentation (OULAD) or per course offering (UBC), never pooled. OULAD and UBC data connect only through class standing and difficulty relative to the same school; raw scores never cross datasets." **d. Residuals against the baseline.** "Offset residuals are measured against the baseline's prediction using only evidence available before the item's due date, never against the personalized model, and each graded item counts once." **e. Stress never changes P(grade).** "It affects only which action is chosen." **f. Probabilities from data, utility from the person.** "λ and θ are settings or stated assumptions, never fitted. The five assumed numbers live in one constants module, each with its sensitivity check." **g. Bounds first.** "Targets that are unreachable or already locked in get P = 0 or 1 before inference, with the reason shown." **h. Withdrawals are excluded** from OULAD counts. |
| Rule 6 (no causal wording) | Keep | Unchanged; v2 §Limitations repeats it. |
| Rule 7 (workflows, main, merge) | Keep | Unchanged. Several workflow edits are needed (§1); they are human edits. |
| Commands | Update | Add: "Rebuild CSVs and `cpts.json`: `python -m bsp_priors.publish --out site/cpts.json`." (match the real module path). `pip install -e priors -e eval` stays. |
| Style | Update example | Docstring example becomes "Laplace-smoothed count table — Laplace add-one smoothing" or "Equipercentile linking — Kolen & Brennan"; keep "small pure functions"; add: "UI calls model and planner functions, never reimplements them." |
| Reviewer prompt | Stale | `claude-review.yml` lines 64–67 list the v1 invariants. Replace with the checklist above so the `requirements-review` check enforces v2. |

---

## 6. Recommended next steps

1. **Pause the nightly agent now** (set `ENABLE_CLAUDE_NIGHTLY` to `false`, or strip `claude-ready` from the v1 issues) until CLAUDE.md and the issue list are updated. It reads the v1 docs and rules today and could build #22.
2. **Decide the Canvas-calendar question** (rule 2): drop Canvas personal-calendar writes and use `.ics` as the fallback (recommended), or write an explicit exception.
3. **Merge #81 and #83** (draft, `ci` and `requirements-review` green). Both are KEEP and independent of the model.
4. **Land the docs and rules:** rename the design file to `docs/design-v2.md`, update CLAUDE.md per §5, and write the v2 decision log. Edit the three Claude workflows and the CI guardrails by hand (rule 7).
5. **Fix or retire `priors-nightly.yml`:** replace the cron with publish-on-change and the correct module path.
6. **Triage issues:** close the 13 FUTURE and 2 OBSOLETE with a one-line comment each; rewrite the 24 REWRITE issues (or close and recreate from the gaps); relabel `claude-ready` only on issues whose criteria are v2. Archive `github-setup/issues.yaml`.
7. **Re-sequence the work.** Suggested order, because each step gates the next: (a) CSV builders and `cpts.json` (G1–G4) → (b) hand-built CPTs and the pgmpy notebook (G5, G6; this is the graded core) → (c) TypeScript inference with parity fixtures (G7) → (d) loader additions, Perf, weights and bounds (G9–G11, G13) → (e) personal offset and back-test (G8) → (f) exhaustive search, utility and stress (G12, G14, G15) → (g) calendar and nightly (G16, G17) → (h) evaluation, personas and the report (G19–G21).
8. **Re-date the milestones.** The existing Week 9–14 milestones were set for v1; today is in Week 9 and v1's Week 11 (quizzes) is now empty.
9. **Run the data-licence check** (G24) before committing derived CSVs.
