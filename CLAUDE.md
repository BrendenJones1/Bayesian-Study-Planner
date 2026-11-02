# CLAUDE.md — Bayesian Study Planner

Instructions for Claude Code working in this repo (locally or through GitHub Actions).

## What this is
A local-first Chrome extension for UBC Canvas that predicts each student's chance of
hitting a target grade, plans study time across all courses, and generates module
quizzes on device. Full design: `docs/design.md`; why each choice was made: `docs/tradeoffs.md`.
Read the relevant section before changing behaviour.

## Layout
- `extension/` — TypeScript, Chrome MV3, Vite, React popup
  - `src/canvas/` Canvas client · `src/timer/` · `src/quiz/` · `src/model/` · `src/planner/` · `src/storage/` · `src/ui/`
- `priors/` — Python 3.12: UBC Grades + OULAD ingest, PyMC fit, publish `priors.json`
- `eval/` — notebooks for LOO comparison, holdouts, calibration, quiz validation
- `shared/fixtures/` — golden test vectors shared by TypeScript and Python

## Commands
- Extension: `cd extension && npm ci && npm test && npm run lint && npm run build`
- Python: `pip install -e priors -e eval && pytest priors eval`

## Hard rules (privacy and scope)
1. **No student data leaves the browser.** No network calls except GET to
   `canvas.ubc.ca/api/v1/...` and GET to the published `priors.json`.
2. **Canvas is read-only.** Never issue POST/PUT/PATCH/DELETE to Canvas.
3. **Quizzes run on device** (Chrome Prompt API, WebLLM fallback) and only after an
   explicit click. Never share generated questions or course text.
4. **Model math must match** between `extension/src/model/` and `priors/`. Any change
   to equations updates `shared/fixtures/` and passes both test suites.
5. **Model invariants** (see the design tradeoffs doc, decisions 20-25):
   - Never apply a logit to an observed score and never clamp scores with an epsilon;
     graded items use the zero-and-one inflated beta likelihood.
   - Spacing is the soft day count, sum of min(1, minutes/30). The model and the planner
     import the same function.
   - OULAD informs curve shape, spacing and lead time only, never the scale of beta.
6. **No causal wording** in UI copy ("students like you", never "you will").
7. Never edit `.github/workflows/`, never push to `main`, never merge.

## How to work an issue
1. Read the issue, its parent story, and the linked design-doc section.
2. If acceptance criteria are ambiguous or need a product decision, comment with
   specific questions, add `needs-human`, and stop.
3. Branch `claude/issue-<n>`; write tests for every criterion; keep the change focused
   on that issue.
4. Open a **draft** PR: body starts with `Closes #<n>`, then each criterion and how it
   was verified, then open questions.
5. A separate reviewer agent checks the PR against the issue's criteria and these rules,
   and the `requirements-review` check must pass. Write code it can verify: one test
   per criterion, named after it.
6. Ponytail is enabled: prefer the smallest change that meets the criteria, with no
   speculative abstractions or dependencies. These rules and the acceptance criteria
   override minimalism (tests are never optional).

## Style
- TypeScript strict mode; no `any` without a comment explaining why.
- Python: type hints, `ruff`, docstrings citing the research basis for model code
  (e.g. "Saturating dose curve — Heathcote, Brown & Mewhort 2000").
- Small pure functions for model and planner math; UI calls them, never reimplements.
