# Bayesian Study Planner — System Design

Nov 2, 2026 · @Brenden

## Overview

The Bayesian Study Planner is a local-first Chrome extension for UBC Canvas. It predicts each student's chance of hitting a target grade on every upcoming assignment and exam, builds one study plan across all their courses, and quizzes them on module material with an on-device model. The pitch to a student: "If you start by Nov 20, you have a 68% chance of scoring 80 or higher" (illustrative).

**What changed in v1.1 (this revision)**

- **Local-first.** No backend and no pooled student data in v1. Everything personal runs and stays in the browser; the only download is a public priors file built nightly.
- **Assignments are modeled**, not just exams, with submission timing pulled automatically from Canvas.
- **Module quizzes** generated on device by Chrome's built-in Gemini Nano give a direct measure of understanding.
- **One joint planner** shares each day's time across every course, respects busy blocks, and flags exam clusters early.
- **Canvas class statistics and UBC Grades** replace pooled data for course baselines; OULAD supplies study-effect priors.
- **MVP-first timeline:** logging ships in Week 9 so real data accumulates before the model is finished.

**Goals (v1, due Week 14)**

- Zero setup: courses, modules, files, deadlines, scores and submission times come from Canvas.
- Calibrated predictions of P(score ≥ target) per graded item, with honest uncertainty.
- A feasible daily plan across all courses, and a "what now" recommendation each time the student presses **Start studying**.
- Per-module quizzes whose results sharpen the model.
- Every model component justified by published research, and validated on held-out data.

**Non-goals (v1):** a shared question bank, instructor dashboards, collecting any student data, schools other than UBC, mobile, chat over course notes, and causal claims about study time.

## Architecture

v1 has no backend: the extension does all personal work in the browser, and a nightly GitHub Action publishes one public priors file.

&#91;embedded content: architecture v1 · local-first extension, nightly priors, v2 donation dashed\]

The extension reads Canvas with the student's own session, generates quizzes with the on-device model, and computes predictions and plans locally. The only network calls are to Canvas and to the static `priors.json`. The dashed path is v2 only.

## Data sources

Most inputs arrive automatically; students only press **Start studying**, answer quizzes, and optionally add busy blocks or ratings.

| Data | Source | Collected how | Used for | Limits |
| --- | --- | --- | --- | --- |
| Courses, modules, files, deadlines, own scores | Canvas REST API | Automatic, student's own session, GET only | Everything | Exam dates often only in the syllabus; student confirms in one click |
| Submission time vs due date | Canvas submissions (`submitted_at`, `due_at`) | Automatic | Procrastination history, assignment model | Records when work finished, not when it started |
| Class score distribution per item (min, quartiles, median, mean, max) | Canvas assignment score statistics ([community answer](https://community.canvaslms.com/t5/Developers-Group/Get-box-and-whisker-plots-averages-for-assignments-via-API/m-p/226530)) | Automatic when the instructor allows it | Item difficulty and between-student spread this term | Instructors can hide it; likely withheld until enough grades exist |
| Historical section grades by instructor | [UBC Grades API v2](https://lcfyi.github.io/ubcgrades/api-reference/) | Nightly job, public data | Course and instructor baselines | Final grades only; unofficial volunteer site |
| Past grades in related courses | Canvas concluded courses | Probably automatic; to verify | Student-level prior | Some instructors hide concluded courses |
| Study sessions (module, minutes, day) | Extension timer | Semi-automatic: Start/Stop with idle detection | Study dose and spacing | Self-reported and noisy |
| Quiz answers per module | On-device quiz generator | Student answers in the popup | Direct ability per module | Question quality varies; see Module quizzes |
| Busy blocks and weekly availability | Student | Manual | Planner capacity | Optional calendar import is v2 |
| Confidence (1–5), study method | Student | Optional manual | Study-quality signal | Missing for many items |
| Daily logged activity and assessment results | [OULAD](https://doi.org/10.1038/sdata.2017.171) public dataset | Offline, nightly job | Priors for curve shape, spacing and lead time (not the size of the study effect); evaluation | Different population (UK distance learning); clicks proxy hours |

## Statistical model

One hierarchical Bayesian model with three observation types — exams, assignments and quiz answers — that share each student's per-course ability. Every graded item and every quiz answer sharpens the prediction for every other item in that course.

**Shared ability.** For student s in course c, with module m:

```latex
a_{scm} = \theta_s + u_{sc} + v_{scm}, \quad \theta_s \sim \mathcal{N}(\mu_\theta, \tau_\theta^2), \; u_{sc} \sim \mathcal{N}(0, \tau_u^2), \; v_{scm} \sim \mathcal{N}(0, \tau_v^2)
```

θ\_s is general strength across courses, u\_sc the course-specific "secret score", v\_scm the module offset. In v1 the pooling is across the student's own courses and modules, not across students.

**Graded items (exams and assignments)** share one zero-and-one inflated beta (ZOIB) likelihood. The logit link applies to the predicted mean μ, never to the observed score, so exact 0% and 100% are valid observations with their own probabilities. With h = hours on the covered modules before the due date, ρ ∈ \[0, 1\] the share of assignment work that transfers to exam readiness (exams only), L = days finished before the due date, and t(i) the item type:

```latex
y_{si} \sim \text{ZOIB}(\mu_{si}, \phi, \pi^{0}_{si}, \pi^{1}_{si}), \quad \text{logit}(\mu_{si}) = \alpha_i + \bar{a}_{s,\text{mods}(i)} + \beta_{c,t(i)}\left(1 - e^{-(h_{si} + \rho\,h^{A}_{si})/\kappa}\right) + \gamma_c \log(1 + d_{si}) + \eta_{t(i)} \log(1 + L_{si})
```

**Spacing uses a soft day count**, so a day counts fully only after 30 minutes and the planner's objective stays concave (m\_sk = minutes on day k):

```latex
d_{si} = \sum_{k < \text{due}(i)} \min\left(1, \frac{m_{sk}}{30}\right)
```

**Score validation (Canvas client):** scores above 100% are capped at 1 and flagged; excused or ungraded items are dropped, never recorded as 0.

**Quiz answers** follow a logistic item model (the Rasch / Performance Factors Analysis family), with b\_j the question's difficulty and a prior from the generator's difficulty tag:

```latex
P(\text{correct}_{sj}) = \sigma\left(a_{scm(j)} - b_j\right), \quad b_j \sim \mathcal{N}(\mu_{\text{tag}(j)}, \tau_b^2)
```

**Where each prior comes from**

- α\_i (item difficulty) and the between-student spread: Canvas class statistics for the item when available; otherwise UBC Grades history for the course and instructor.
- Study, spacing and start-time effects: κ (curve shape, in normalized dose units), γ and η come from OULAD, since spacing and lead time are measured in days in both datasets. Clicks are not hours, so the size of the study effect β gets only a weakly informative prior; OULAD is a different population, so all its priors are widened. Each student's own data updates them across all their courses.
- The saturating curve 1 − e^(−h/κ) is the first candidate; log(1 + h) is the alternative. Both are compared by held-out prediction (Evaluation).

**Two loops**

1. **Nightly (Python, PyMC):** fit population-level parameters on UBC Grades and OULAD; publish posterior summaries to `priors.json`.
2. **In the browser (TypeScript):** with population parameters fixed, update θ\_s, u\_sc, v\_scm by a Laplace approximation (damped Newton steps from the prior mean, a positive-definite curvature check with fallback to the prior, and parity tests against full MCMC) after every new grade or quiz answer. Milliseconds, no server.

**Prediction.** For a candidate plan, compute h, d and L by each due date, draw from the posterior predictive, and report P(score ≥ target). Predictions are frozen and timestamped before each grade is released, for evaluation.

**Confounding.** Weaker students study more, so raw hours correlate poorly with grades. Within-student comparison across items helps; predictions are still framed as "students like you", never as causal promises.

## Research basis

Every component rests on published evidence, but the evidence transfers to this setting with different strength. The model as a whole is research-informed, not yet research-validated; validation is the Evaluation section's job.

| Component | Why it should work | Transfer to this setting | How we check |
| --- | --- | --- | --- |
| Hierarchical partial pooling | Multilevel models are almost always an improvement over classical regression and can be essential for prediction; in Gelman's radon example, cross-validated county-level error fell from .50 (complete pooling) to .40 ([Gelman 2006](https://doi.org/10.1198/004017005000000661)) | **Strong.** Few graded items per student per course is exactly the sparse-group case pooling helps | LOO: hierarchical vs no-pooling vs complete-pooling |
| Hours matter, but weakly | Study time predicted GPA only once study quality and prior performance were in the model ([Plant et al. 2005](https://scinapse.io/papers/1967899510)) | **Strong as a warning.** Justifies the student-level terms and the quiz signal; hours alone will be noisy | Compare models with and without hours |
| Diminishing returns, saturating curve | Across 40 data sets (7,910 learning series, 475 subjects), individual learning curves fit an exponential better than a power function in every unaveraged set ([Heathcote, Brown & Mewhort 2000](https://doi.org/10.3758/bf03212979)) | **Partial.** Shown for response time vs practice trials, not grades vs hours; motivates 1 − e^(−h/κ) | Exponential vs log(1 + h) by LOO |
| Spacing (study days) | Meta-analysis of 839 assessments in 317 experiments; the best gap between sessions grows with the retention interval ([Cepeda et al. 2006](https://pubmed.ncbi.nlm.nih.gov/16719566/)). Distributed practice and practice testing were the only two techniques rated high utility ([Dunlosky et al. 2013](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)) | **Partial.** Mostly verbal recall; in a summarized review only a third of intellectual-skill studies showed a benefit ([Cepeda et al. PDF](https://www.evullab.org/pdf/CepedaPashlerVulWixtedRohrer-PB-2006.pdf)), so math-heavy courses may differ | γ varies by course; LOO with and without spacing |
| Start time / procrastination (assignments) | Across 1,101 students in three CS courses, better-graded students started and finished assignments earlier ([Edwards et al. 2009](https://doi.org/10.1145/1584322.1584325)); procrastination correlates negatively with performance, about r = −.13 over 33 studies ([Kim & Seo 2015](https://doi.org/10.1016/j.paid.2015.02.038)) | **Strong for CS assignments**, small effect size overall | Lead-time term η on held-out assignments |
| Ceiling-heavy assignment scores | Zero-or-one inflated beta regression models proportions with mass at 0 or 1 ([Ospina & Ferrari 2012](https://doi.org/10.1016/j.csda.2011.10.005)) | **Strong.** Many scores are exactly 100% (some 0%); the zero-and-one variant is used for exams and assignments | Posterior predictive check of the score histogram |
| Quizzes as measurement and as learning | Testing improves delayed retention more than restudying ([Roediger & Karpicke 2006](https://doi.org/10.1111/j.1467-9280.2006.01693.x)); logistic ability-minus-difficulty models (BKT, PFA) are the standard student models ([Corbett & Anderson 1995](https://doi.org/10.1007/bf01099821); [Pavlik, Cen & Koedinger 2009](https://researchr.org/publication/PavlikCK09)) | **Strong for the learning effect; partial for measurement.** BKT and PFA have been reported as comparably mediocre predictors ([Galyardt & Goldin 2015](https://arxiv.org/pdf/1501.02732)), and our questions are machine-generated | Does module quiz accuracy predict exam scores better than hours? |
| Population data personalizing review | Combining population-level statistics with a memory model (DASH) improved retention 16.5% over massed study and 10.0% over generic spacing ([Lindsey et al. 2014](https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/LindseyShroyerPashlerMozer2014.pdf)) | **Partial.** DASH used item-level recall data; ours is coarser (hours, grades, quizzes) | Closest precedent, cited as the design's inspiration |
| Machine-generated questions | 651 GPT-4 questions vs 449 human ones across 6 Python courses: generated items were mostly clear, had one correct answer, and aligned with learning objectives ([Doughty et al. 2024](https://arxiv.org/abs/2312.03173)) | **Weak.** Gemini Nano is much smaller than GPT-4 and our notes are unvetted | Hand-check a sample; report the error rate |
| "What now" via Thompson sampling | Simple to implement and state-of-the-art on ad selection and news recommendation ([Chapelle & Li 2011](https://papers.nips.cc/paper/2011/hash/e53a0a2978c28872a4505bdb51db06dc-Abstract.html)) | **Partial.** Rewards here are delayed grades, not clicks | Simulation: Thompson vs greedy vs round-robin |
| Greedy joint allocator | Giving each unit to the activity with the largest marginal gain is optimal for separable concave allocation under one budget ([Fox 1966](https://econpapers.repec.org/RePEc:inm:ormnsc:v:13:y:1966:i:3:p:210-216); [Federgruen & Groenevelt 1986](https://doi.org/10.1287/opre.34.6.909)) | **Strong for one day; approximate overall.** With the soft day count the full plan is concave and solved exactly; greedy is kept as a tested heuristic | Compare greedy plans to brute force on small cases |
| Sleep (v2, optional) | Sleep measures explained nearly 25% of grade variance; the night before a test did not matter ([Okano et al. 2019](https://doi.org/10.1038/s41539-019-0055-z)) | **Partial.** 88 students, one MIT course, correlational | v2 only; local-only health data |
| Model selection | PSIS-LOO estimates out-of-sample predictive accuracy from posterior draws and is more robust than WAIC with weak priors ([Vehtari, Gelman & Gabry 2017](https://arxiv.org/abs/1507.04544)) | **Strong.** The standard tool for comparing Bayesian models | ArviZ `az.compare` |

## Module quizzes

Quizzes are generated on the student's own machine from their own course files, only when the student asks. Canvas modules are already topic-sized, so no embeddings or vector database are needed: "retrieval" is fetching that module's files.

1. Student clicks **Quiz me on Module 3**. First use shows a one-time notice to check the course's AI policy in the syllabus.
2. The extension fetches the module's files through the Canvas Files API and extracts text (pdf.js for PDFs, a parser for slides), split by page.
3. Chrome's built-in Gemini Nano ([Prompt API for extensions](https://developer.chrome.com/docs/extensions/ai/prompt-api)) writes multiple-choice questions from key-concept blocks of about 300 words, one fresh session per block, each prompt checked with measureContextUsage() against the session's contextWindow before sending (no browser flags needed for extensions on Chrome 138+), each with an answer, a short explanation, a cited page, and a difficulty tag (easy / medium / hard).
4. A self-check prompt asks the model to answer each question blind; questions it gets wrong or marks ambiguous are dropped.
5. The student answers; results update v\_scm through the quiz likelihood. Immediate feedback with the cited page turns each quiz into retrieval practice.
6. A **Report question** button flags bad items; flagged items are excluded from the model.

**Exam-coverage extraction** uses the same on-device model on announcements and the syllabus ("Midterm 2 covers Modules 4–7") to map graded items to modules automatically, with a one-click confirmation.

**Hardware.** Gemini Nano runs only in desktop Chrome and needs at least 22 GB free storage plus a GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4 CPU cores ([hardware requirements](https://developer.chrome.com/docs/ai/prompt-api)). The extension checks `LanguageModel.availability()` and falls back to: WebLLM on WebGPU, then an optional bring-your-own API key, then quizzes off (the rest of the planner still works).

**Never in v1:** sending course content to any server of ours (a student who opts into their own API key sends it to their chosen provider, with a warning), sharing generated questions between students, or generating in the background.

## Planner

All courses share one time budget per day. Assignment work and exam study draw from the same budget, so nothing is double-counted, and every prediction assumes only the hours the student can actually get.

**Objective.** x\_{i,d} = minutes given to graded item i on day d; C\_d = that day's capacity; w\_i = the item's weight in the final grade:

```latex
\max_{x} \sum_{i} w_i \, \mathbb{E}[\text{score}_i \mid x] \quad \text{s.t.} \quad \sum_{i} x_{i,d} \le C_d, \quad x_{i,d} \le c_{\text{course}}, \quad \sum_{i} x_{i,d} \le c_{\text{day}}
```

**Solver.** With the soft day count, every gain term is concave and the constraints are linear, so the plan is a small convex program (about 10 items × 30 days) solved exactly by projected gradient ascent in TypeScript, then rounded to 30-minute blocks. Greedy marginal allocation is kept as the fast "what now" heuristic and tested against the exact solution. An hour on a module counts once against capacity but adds gain to every item that covers that module.

**Capacity.**

- Default weekly availability set at onboarding (for example 2 h weekdays, 4 h weekends).
- Busy blocks (shifts, trips, team commitments) reduce C\_d for those days.
- Per-course-per-day and per-day caps keep the plan humane and push it toward interleaving.
- Calendar import (free/busy only) is v2.

**Exam clusters (for example three midterms in three days).**

1. **Crunch detection, weeks early:** when the days before a cluster cannot cover every target, the popup says so: "3 midterms Nov 25–27: start by Nov 12 to stay on track."
2. **Interleave, don't block:** the caps and the spacing term spread each course across days; the final day before each exam leans toward that exam.
3. **Explicit tradeoffs:** if targets cannot all be met, the student chooses ("keep 80 in COSC 421 and accept 70 in STAT 230, or 75 in both?"). The planner never silently drops a course. Spare time flows to the course with the largest marginal gain, which is usually the weakest relative to its target.

**"What now?"** When the student presses **Start studying**, Thompson sampling draws one sample of their parameters, re-scores today's candidate blocks, and recommends the top one with the runner-up shown. Sampling, rather than always taking the mean, also explores modules the model is unsure about.

**Live updates.** Adding a busy block, finishing a session, a new grade or a quiz result reruns the allocator and the predictions immediately, so the student sees the cost of a commitment: "Your trip Nov 14–16 drops P(≥ 80) from 68% to 55% unless you start by Nov 10" (illustrative).

## Data model

In v1 every record about a student lives in the browser's IndexedDB; the only shared artifact is a public, read-only `priors.json`.

| Store | Where | Key fields |
| --- | --- | --- |
| `course_cache` | Browser | canvas\_course\_id, course\_code, term, instructor, modules\[\], items\[\] (type exam/assignment, due\_at, weight, points, module\_ids, class\_stats) |
| `submission_history` | Browser | item\_id, submitted\_at, due\_at, score, lead\_days |
| `study_session` | Browser | session\_id, course\_id, module\_id, started\_at, ended\_at, active\_minutes |
| `quiz_item` | Browser | question\_id, module\_id, source\_page, difficulty\_tag, flagged |
| `quiz_answer` | Browser | question\_id, correct, answered\_at |
| `posterior` | Browser | course\_id, θ, u, v per module (means, variances), updated\_at |
| `availability` | Browser | weekly defaults, busy blocks (start, end, label) |
| `frozen_prediction` | Browser | item\_id, predicted P(≥ target), predictive interval, created\_at |
| `priors.json` | GitHub Pages (public) | model\_version, fitted\_at, per course and instructor: α prior, spread; global: β, γ, κ, ρ, η posteriors |

**Export my data** writes all browser stores to one JSON file. Pilot users send it voluntarily for evaluation; nothing uploads automatically.

## Privacy, copyright and ethics

v1 collects nothing, so the re-identification risks of pooled data do not arise; the remaining questions are copyright and honest framing.

- **No collection.** Grades, sessions, quiz answers and busy blocks stay in IndexedDB. Class statistics come from Canvas itself, so any aggregate a student sees was released by Canvas, not by us.
- **Least privilege.** Host permission for `canvas.ubc.ca` only; GET calls only.
- **Course materials.** UBC has no central rule on generative AI; it is decided per course ([UBC learning design FAQ](https://learningdesignviews.educ.ubc.ca/?p=12081)). UBC's student guide warns that uploading course materials to AI tools may infringe copyright and asks students to check what they upload ([GenAI quick-start for students](https://it.ubc.ca/sites/it.ubc.ca/files/GenAi_Quickstart_Learning_V2.pdf)). Hence: student-initiated, on-device, never shared, and a one-time notice to check the syllabus.
- **UBC acceptable use.** Policy SC14 binds all users of UBC electronic information and systems ([Information Systems Policy](https://universitycounsel.ubc.ca/policies/information-systems-policy)). No rule specific to student-built Canvas extensions was found; confirm with the privacy office or LT Hub before any public release.
- **Honest framing.** Predictions show uncertainty and read as "students like you". No fatalistic messages ("you will fail"). Courses with little data get wider intervals, and the popup says so.
- **No instructor rankings.** Instructor history is a model input only.
- **Pilot.** Friends who test it consent explicitly and send their exported data voluntarily. Results are reported as usage analytics; publishing them as research would need UBC behavioural research ethics approval.
- **Academic integrity.** Confirm this course's syllabus allows AI-assisted code in the project before running the Claude Code pipeline.

## Tech stack and repo structure

TypeScript where the browser requires it, Python for modeling and evaluation, and no servers to run in v1.

| Layer | Choice | Why |
| --- | --- | --- |
| Extension | TypeScript, Chrome Manifest V3, Vite, React popup, bundled Chart.js | Runs inside Canvas with the student's session; MV3 forbids remote scripts |
| On-device LLM | Chrome Prompt API (Gemini Nano); WebLLM fallback | Free, no key, content stays local |
| PDF / slide text | pdf.js; a PPTX parser | Runs in the browser |
| Personal model, planner | TypeScript (Laplace updates, greedy allocator, Thompson sampling) | Instant, offline |
| Storage | IndexedDB | Large enough for files' text and history |
| Nightly priors | Python 3.12, PyMC, ArviZ, pandas in a GitHub Actions cron | Free; no server to maintain |
| Priors hosting | GitHub Pages (`priors.json`) | Static, cacheable, public |
| Evaluation | Jupyter notebooks (Python) | Matches the course's Python requirement |
| Testing and CI | Vitest, pytest, GitHub Actions | Every PR |
| Dev automation | Claude Code GitHub Action on labeled issues; nightly run | See the GitHub workflow guide |

**Parity risk.** The model math exists in Python (fit, evaluation) and TypeScript (extension). Shared golden test vectors in `shared/fixtures/` run in both test suites so they cannot drift.

```
bayesian-study-planner/
  extension/
    src/canvas/       # Canvas API client, class stats, submissions
    src/timer/        # Start studying, idle detection
    src/quiz/         # file text extraction, Gemini Nano generation, self-check
    src/model/        # Laplace updates, predictions, frozen predictions
    src/planner/      # joint allocator, Thompson sampling, crunch detection
    src/storage/      # IndexedDB, export
    src/ui/           # React popup
  priors/             # Python: ingest_ubcgrades.py, ingest_oulad.py, fit.py, publish.py
  eval/               # notebooks: LOO comparison, holdouts, prospective, quiz validation
  shared/fixtures/    # golden vectors for TS/Python parity
  .github/workflows/  # ci.yml, priors-nightly.yml, claude.yml, claude-nightly.yml
```

## Evaluation and model selection

The model is chosen by held-out prediction, not by argument, and the report states where evidence is thin. The headline question: **does module quiz accuracy predict exam scores better than study hours do?**

**Candidate models, compared by PSIS-LOO and temporal holdout**

1. Course mean only
2. Hierarchy, no study variables
3. - saturating hours (vs log hours)
4. - spacing
5. - item-type-specific curves (exam vs assignment) and start time
6. - quiz ability

Terms that do not improve held-out prediction are dropped.

| Test | Data (unseen) | Metric |
| --- | --- | --- |
| Study, spacing and start-time effects | [OULAD](https://doi.org/10.1038/sdata.2017.171): 22 module runs, 32,593 students; train on 2013 runs, test on 2014 | Log loss, MAE vs course-mean baseline |
| Course and instructor baselines | UBC Grades: predict each course's latest session from earlier ones | MAE in percentage points vs "last session's average" |
| Personal predictions | Me and friends, prospectively: predictions frozen before each grade is released | Brier score, calibration plot (qualitative given small n) |
| Quiz quality | Hand-checked sample of generated questions per course | Error rate, ambiguous rate, flag rate |
| Planner | Simulated students drawn from the fitted model: cram vs evenly spaced vs planner | Predicted score distribution per strategy |
| Allocator | Small cases solved by brute force | Gap between greedy and optimal |
| Usability | Friends pilot | Setup time, sessions per week, short feedback form |

With about 5 pilot users and roughly 10 graded items each, pilot data validates the pipeline and personal updates; it cannot fit course-level slopes. The report says so. Browser posteriors are also checked against full MCMC (NUTS) on fixtures, and intervals that come out more than about 20% too narrow are widened; the spacing term is compared as soft vs integer day count.

## Future work (v2+)

Each item below is a stretch goal with its own GitHub issue; none blocks the Week 14 deliverable.

| Item | What it adds | Prerequisite or caveat |
| --- | --- | --- |
| End-of-term data donation | Opt-in, once after final grades; per item: random ID, course, hours bucket, study days, quiz-accuracy bucket, score bucket. Released once a year as next year's priors, only for courses with at least 10 donors | Small server endpoint; one yearly release removes the before/after differencing attack; research use needs ethics approval |
| Shared class question bank | Questions answered by many students get calibrated difficulties (true IRT), which makes quiz scores far more informative | **Instructor buy-in required**: generated questions derive from course materials. This course's instructor researches learning analytics, so a co-designed pilot is plausible |
| Redis cache for the shared bank | Fast reads if the bank is served to many students | Only with the shared bank; Postgres is enough at small scale |
| Calendar import | Free/busy from .ics or Google Calendar into capacity | Read free/busy only, never event details |
| Sleep and wellbeing inputs | Optional sleep duration and consistency as predictors | Health data: local only; evidence is correlational |
| Better quiz model | Bring-your-own key for a frontier model, or server generation under instructor agreement | Copyright and cost |
| Differential privacy on donations | Calibrated noise on released priors | Hard to combine with a Bayesian fit; resume-worthy research add-on |
| Other schools | Any Canvas instance | Needs that school's grade history in place of UBC Grades |

## Risks and open questions

The two biggest risks are weak study-effect estimates without pooled data and low-quality generated questions; both are measured and reported rather than hidden.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Study-effect priors come from OULAD, a different population | Study-time slope is uncertain for UBC courses | Wide priors; within-student updates across courses; say so in the report; donation in v2 |
| Generated questions are wrong or ambiguous | Noise in the ability estimate | Self-check filter, Report button, hand-checked error rate, difficulty prior |
| Student's machine cannot run Gemini Nano | No quizzes | WebLLM, then optional own key, then quizzes off |
| Canvas class statistics hidden | No current-term item baseline | Fall back to UBC Grades history |
| Canvas changes, or UBC restricts extension API calls | Data cannot load | Documented REST endpoints only; manual entry fallback |
| Exam dates or coverage missing | Wrong mapping of items to modules | On-device extraction from announcements and syllabus, plus one-click confirm |
| Noisy timer data | Biased dose estimates | Idle detection; edit or delete sessions |
| TypeScript and Python math drift | Extension and report disagree | Shared golden fixtures in both suites |
| AI-generated code not allowed in the course | Pipeline cannot be used | Check the syllabus before Week 9 work starts |

**Open questions**

- Does Canvas still list concluded courses with grades for UBCO students?
- What minimum graded count does Canvas require before showing class statistics?
- How coarse should hour and score buckets be for the v2 donation?
- Is "load unpacked" acceptable for the pilot, or is a Chrome Web Store listing needed?

## Milestones

The logging MVP ships in Week 9 so real grades and study sessions accumulate before the model is finished; Week 10 is midterm break.

&#91;embedded content: milestones · Weeks 8 to 14\]

Each row maps to a GitHub milestone, and each milestone holds the user stories and sub-issues for that week.

## Sources

- Cepeda, Pashler, Vul, Wixted & Rohrer (2006). [Distributed practice in verbal recall tasks: A review and quantitative synthesis](https://pubmed.ncbi.nlm.nih.gov/16719566/). *Psychological Bulletin* 132(3).
- Chapelle & Li (2011). [An empirical evaluation of Thompson sampling](https://papers.nips.cc/paper/2011/hash/e53a0a2978c28872a4505bdb51db06dc-Abstract.html). NeurIPS.
- Corbett & Anderson (1995). [Knowledge tracing: Modeling the acquisition of procedural knowledge](https://doi.org/10.1007/bf01099821). *UMUAI* 4(4).
- Doughty et al. (2024). [A comparative study of AI-generated (GPT-4) and human-crafted MCQs in programming education](https://arxiv.org/abs/2312.03173).
- Dunlosky, Rawson, Marsh, Nathan & Willingham (2013). [Improving students' learning with effective learning techniques](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html). *Psychological Science in the Public Interest* 14(1).
- Edwards et al. (2009). [Comparing effective and ineffective behaviors of student programmers](https://doi.org/10.1145/1584322.1584325). ICER.
- Federgruen & Groenevelt (1986). [The greedy procedure for resource allocation problems](https://doi.org/10.1287/opre.34.6.909). *Operations Research* 34(6).
- Fox (1966). [Discrete optimization via marginal analysis](https://econpapers.repec.org/RePEc:inm:ormnsc:v:13:y:1966:i:3:p:210-216). *Management Science* 13(3).
- Galyardt & Goldin (2015). [Predicting performance during tutoring with models of recent performance](https://arxiv.org/pdf/1501.02732).
- Gelman (2006). [Multilevel (hierarchical) modeling: What it can and cannot do](https://doi.org/10.1198/004017005000000661). *Technometrics* 48(3).
- Heathcote, Brown & Mewhort (2000). [The power law repealed: The case for an exponential law of practice](https://doi.org/10.3758/bf03212979). *Psychonomic Bulletin & Review* 7(2).
- Kim & Seo (2015). [The relationship between procrastination and academic performance: A meta-analysis](https://doi.org/10.1016/j.paid.2015.02.038). *Personality and Individual Differences* 82.
- Kuzilek, Hlosta & Zdrahal (2017). [Open University Learning Analytics dataset](https://doi.org/10.1038/sdata.2017.171). *Scientific Data* 4.
- Lindsey, Shroyer, Pashler & Mozer (2014). [Improving students' long-term knowledge retention through personalized review](https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/LindseyShroyerPashlerMozer2014.pdf). *Psychological Science* 25.
- Okano, Kaczmarzyk, Dave, Gabrieli & Grossman (2019). [Sleep quality, duration, and consistency are associated with better academic performance in college students](https://doi.org/10.1038/s41539-019-0055-z). *npj Science of Learning* 4.
- Ospina & Ferrari (2012). [A general class of zero-or-one inflated beta regression models](https://doi.org/10.1016/j.csda.2011.10.005). *CSDA* 56(6).
- Pavlik, Cen & Koedinger (2009). [Performance Factors Analysis — a new alternative to knowledge tracing](https://researchr.org/publication/PavlikCK09). AIED.
- Plant, Ericsson, Hill & Asberg (2005). [Why study time does not predict grade point average across college students](https://scinapse.io/papers/1967899510). *Contemporary Educational Psychology* 30(1).
- Roediger & Karpicke (2006). [Test-enhanced learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x). *Psychological Science* 17(3).
- Vehtari, Gelman & Gabry (2017). [Practical Bayesian model evaluation using leave-one-out cross-validation and WAIC](https://arxiv.org/abs/1507.04544). *Statistics and Computing* 27(5).
- Tools and policy: [Chrome Prompt API for extensions](https://developer.chrome.com/docs/extensions/ai/prompt-api), [Prompt API hardware](https://developer.chrome.com/docs/ai/prompt-api), [UBC Grades API](https://lcfyi.github.io/ubcgrades/api-reference/), [Canvas assignment statistics](https://community.canvaslms.com/t5/Developers-Group/Get-box-and-whisker-plots-averages-for-assignments-via-API/m-p/226530), [UBC SC14](https://universitycounsel.ubc.ca/policies/information-systems-policy), [UBC GenAI student guide](https://it.ubc.ca/sites/it.ubc.ca/files/GenAi_Quickstart_Learning_V2.pdf).
