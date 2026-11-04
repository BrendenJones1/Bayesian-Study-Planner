# CLAUDE.md — Bayesian Study Planner

Instructions for Claude Code working in this repo (locally or through GitHub Actions).

## What this is
A local-first Chrome extension for UBC Canvas. Each night it picks a study action for every
course with an upcoming exam (intense 5 h, light 1 h, or rest) by comparing expected utility:
the chance of reaching a grade target, minus a stress cost. A discrete Bayesian network
computes both, using tables learned by counting from OULAD, UBC Grades (PAIR) and
StudentLife, plus the student's own Canvas data. Full design, including why each choice was
made (see Assumptions and limitations, and Out of scope): `docs/design-v2.md`.
Read the relevant section before changing behaviour.

## Layout
- `extension/` — TypeScript, Chrome MV3, Vite, React popup
  - `src/canvas/` Canvas client (GET only) · `src/timer/` · `src/model/` exact enumeration and the
    personal offset · `src/planner/` exhaustive plan search · `src/calendar/` Google Calendar
    (the only code allowed to call Google) · `src/storage/` · `src/ui/`
- `priors/` — Python 3.12, package `bsp_priors`: builds one CSV per learned table from OULAD,
  UBC PAIR and StudentLife, learns Laplace-smoothed CPTs, publishes `cpts.json`
- `eval/` — pgmpy notebooks: variable-elimination inference, personas, held-out evaluation,
  offset back-test
- `shared/fixtures/` — golden vectors for variable-elimination parity between pgmpy and TypeScript

## Commands
Before every push, run exactly what CI runs, from the repo root:
- If `scripts/ci-local.sh` exists: `scripts/ci-local.sh` (add `--fix` to auto-fix lint).
- Otherwise:
  - Extension: `cd extension && npm ci && npm run lint && npm test && npm run build`
  - Python (repo root): `pip install ruff pytest -e priors -e eval && ruff check . && pytest -q`
- Rebuild the CSVs and `cpts.json` (entry point added by the `cpts.json` issue):
  `python -m bsp_priors.publish --out site/cpts.json`
A PR whose CI fails is not done. Never claim a check passed unless you ran it.

## Hard rules (privacy and scope)
1. **No student data leaves the browser,** with one exception: the student's own Google
   Calendar, and only after they click Connect. Allowed network calls: GET
   `canvas.ubc.ca/api/v1/...`; GET the published `cpts.json`; and, from `extension/src/calendar/`
   only, Google Calendar free/busy queries (scope `calendar.freebusy`) and create, update or
   delete of the study blocks the planner itself wrote (scope `calendar.events`). Never read
   event titles or details. Event titles contain a course code and hours only, never grades,
   probabilities or stress. No other host.
2. **Canvas is read-only.** Never issue POST/PUT/PATCH/DELETE to Canvas. Study blocks go to
   Google Calendar or to an `.ics` file, never to Canvas.
3. *(Moved to "Parked v1 rules" below. Quizzes are not part of v2.)*
4. **Inference must match.** `extension/src/model/` (exact enumeration) must reproduce pgmpy
   `VariableElimination` from `eval/` on every vector in `shared/fixtures/`. Only `priors/`
   turns counts into probabilities; the extension never re-estimates a population CPT. Any
   change to a CPT, the network structure or the offset formula updates `shared/fixtures/` and
   passes both test suites.
5. **Model invariants** (`docs/design-v2.md`: Network, Prediction, Learning the CPTs,
   Personal offset, Stress, Decision):
   - **a. Laplace smoothing.** Every learned CPT is (N(x,u) + α) / (N(u) + α·|X|) with α = 1;
     no shipped table has a zero entry.
   - **b. No leakage.** Perf, Study and Timeliness for an assessment use only data dated before
     it; the outcome uses that assessment or the final result only. Held-out splits are by
     student, never by row.
   - **c. Ranks within class.** Thirds and deciles are computed per module presentation (OULAD)
     or per course offering (UBC), never pooled. OULAD and UBC data connect only through class
     standing and difficulty relative to the same school; raw scores never cross datasets.
   - **d. Residuals against the baseline.** Offset residuals are measured against the baseline's
     prediction, using only evidence available before the item's due date, never against the
     personalized model, and each graded item counts once.
   - **e. Stress never changes P(grade).** It affects only which action is chosen.
   - **f. Probabilities from data, utility from the person.** λ and θ are settings or stated
     assumptions, never fitted. The five assumed numbers live in one constants module, each
     with its sensitivity check.
   - **g. Bounds first.** Targets that are unreachable or already locked in get P = 0 or 1
     before inference, with the reason shown.
   - **h. Withdrawals are excluded** from OULAD counts.
6. **No causal wording** in UI copy ("students like you", never "you will").
7. Never edit `.github/workflows/`, never push to `main`, never merge.

## Parked v1 rules
These belong to the v1 design (`docs/design.md`, `docs/tradeoffs.md`, decisions 4, 11, 12 and 20-25),
which is parked as future work. Do not apply them in v2; they return only if that scope does.
- **Quizzes run on device** (Chrome Prompt API, WebLLM fallback) and only after an explicit
  click. Never share generated questions or course text.
- Never apply a logit to an observed score and never clamp scores with an epsilon; graded items
  use the zero-and-one inflated beta likelihood.
- Spacing is the soft day count, sum of min(1, minutes/30), shared by the model and the planner.
- OULAD informs curve shape, spacing and lead time only, never the scale of beta.

## How to work an issue
1. Read the issue, its parent story, the issues it lists under "Depends on", and the linked
   design-doc section.
2. If the body starts with "Depends on #N" and any listed issue is still open, comment, add
   `blocked`, and stop.
3. If acceptance criteria are ambiguous or need a product decision, comment with
   specific questions, add `needs-human`, and stop.
4. Branch `claude/issue-<n>`; write tests for every criterion; keep the change focused
   on that issue.
5. Open a **draft** PR: body starts with `Closes #<n>`, then each criterion and how it
   was verified, then open questions.
6. A separate reviewer agent checks the PR against the issue's criteria and these rules,
   and the `requirements-review` check must pass. Write code it can verify: one test
   per criterion, named after it.
7. Ponytail is enabled: prefer the smallest change that meets the criteria, with no
   speculative abstractions or dependencies. These rules and the acceptance criteria
   override minimalism (tests are never optional).

## Style
- TypeScript strict mode; no `any` without a comment explaining why.
- Python: type hints, `ruff`, docstrings citing the research basis for model code
  (e.g. "Equipercentile linking — Kolen & Brennan, Test Equating, Scaling, and Linking").
- Small pure functions for model and planner math; UI calls them, never reimplements.
