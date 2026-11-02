# Bayesian Study Planner — Design Tradeoffs

Nov 2, 2026 · @Brenden

Every major choice in the project, what it was weighed against, and why it won. Companion to the [system design doc](https://claude.ai/artifact/APGED2LzH7KKL9qvdp83iJ).

## Decision log

Nineteen decisions shaped the design. Most traded a feature or a resume buzzword for privacy, scope or statistical honesty.

| # | Decision | Options weighed | Chosen | Why | Cost accepted |
| --- | --- | --- | --- | --- | --- |
| 1 | Project option | Mini Co-Pilot, At-Risk prediction, Bayesian planner, StackOverflow network | Bayesian planner | Most distinctive for a COSC/stats student; a tool students would actually use; real statistics rather than API plumbing | Harder modeling than At-Risk; no off-the-shelf solution |
| 2 | Language | R (Shiny), Python | Python for modeling and evaluation; TypeScript for the extension | Course requires Python; a browser extension must be TypeScript/JavaScript anyway | Model math lives in two languages, so golden-vector parity tests are required |
| 3 | How data gets in | Manual syllabus entry, official Canvas LTI app, Chrome extension | Chrome extension on canvas.ubc.ca | Zero setup for students; no institutional approval needed (an LTI app needs UBC sign-off) | Desktop Chrome only; depends on Canvas's API staying stable |
| 4 | Content source | Own question bank, source-agnostic logging, quizzes from Canvas files | Source-agnostic planner plus on-device quizzes from the student's own module files | Avoids building a question bank per course; quizzes give a direct signal of understanding | Question quality is unproven and must be hand-checked |
| 5 | Core model | Bayesian Knowledge Tracing, Beta-Bernoulli per topic, hierarchical dose-response | Hierarchical Bayesian model with exam, assignment and quiz observations sharing one ability | Few graded items per student is exactly where partial pooling helps; BKT's guess/slip parameters are poorly identified on sparse personal data | Not a published model as a whole; must be validated, with BKT kept as a baseline |
| 6 | Diminishing-returns curve | log(1 + hours), saturating exponential | Exponential first, log as the alternative; chosen by held-out prediction | Individual learning curves fit exponential better than power curves | Evidence comes from reaction-time studies, not grades |
| 7 | Assignments | Exams only, both with one curve, both with separate likelihoods | Both, separate likelihoods, shared ability | Assignments and midterms are the only grades that arrive before Week 14; assignment scores pile up at 100% and need a one-inflated beta | More model complexity; a transfer parameter between assignment work and exam readiness |
| 8 | Where student data lives | Nightly pooling on a server, fully client-side, local-first plus public priors | Local-first; only a public priors file comes in | Removes re-identification risk (differencing attacks on small classes) and all backend ops | Study-time slope can't be learned from UBC students in v1 |
| 9 | Course baselines | Pooled user data, UBC Grades history, Canvas class statistics | UBC Grades plus Canvas statistics | Covers the whole class, not just opt-in users; released by Canvas, not by us | Statistics can be hidden by instructors; UBC Grades is final grades only |
| 10 | Study-effect priors | Literature values only, pooled users, public dataset | OULAD (32,593 students) fit offline | Real daily activity paired with assessment results, free and anonymized | Different population (UK distance learning); clicks only proxy hours |
| 11 | RAG scope | Full RAG chatbot over notes, module quizzes, nothing | Module quizzes plus exam-coverage extraction; no chat, no vector database | Quizzes feed the model; chat over notes is what students already get from other tools; Canvas modules are already topic-sized chunks | Less flashy than a chatbot |
| 12 | Who runs the LLM | Student's own API key, our server proxy, Chrome's Gemini Nano, WebLLM | Gemini Nano, then WebLLM, then optional own key | Free, no key, course material never leaves the machine | Small model; needs >4 GB VRAM or 16 GB RAM; desktop only |
| 13 | Redis | Add a cache, skip it | Skip (twice) | Data is tiny; nothing is latency-critical; a shared question bank is the only real use case and it's v2 | None now; revisit with the shared bank |
| 14 | Backend | FastAPI + Postgres, Shiny, none | None in v1: GitHub Actions + GitHub Pages | Local-first makes a server unnecessary; nothing to host or secure | Loses a generic API bullet; FastAPI returns if donation ships |
| 15 | Planning across courses | Plan each item separately, one joint budget | Joint allocator, greedy by marginal gain | Prevents double-booking; greedy is optimal for a single concave budget | Approximate across days once spacing is added |
| 16 | "What now" choice | Highest expected gain, Thompson sampling | Thompson sampling | Balances weak modules against uncertain ones without hand-tuned bonuses | Recommendations vary slightly between clicks |
| 17 | Timeline | Model first, logging MVP first | Logging MVP in Week 9 | Data collection is the bottleneck; every week without logging loses real midterm data | Early predictions run on priors only |
| 18 | Instructor-facing features | Dashboards and instructor rankings, none | None in v1; no rankings ever | Rankings shift the tool toward "easiest section"; dashboards need ethics review and depress honest use | Less to show instructors; shared bank deferred to v2 with buy-in |
| 19 | Data for next year | No collection, nightly pooling, end-of-term donation | Opt-in donation once after grades, one release per year (v2) | Single yearly release removes the before/after attack; current students never exposed | Needs a small server and ethics approval for research use |

## Model decisions (20–25)

These came from a review of the first model on Nov 2. Three were real bugs or gaps (20, 22, 25); the rest sharpened choices that were right but under-justified.

| # | Decision | Options weighed | Chosen | Why | Cost accepted |
| --- | --- | --- | --- | --- | --- |
| 20 | Scores of exactly 0% or 100% | Logit of the observed score; clamp to 0.001–0.999; zero-and-one inflated beta (ZOIB) | ZOIB for every graded item, plus score validation in the Canvas client | logit(1) is infinite, so the original exam equation broke on a perfect score. Clamping makes results depend on an arbitrary epsilon: logit(0.999) ≈ 6.9 but logit(0.9999) ≈ 9.2. ZOIB puts the logit on the mean, never on the data, and models exact 0s and 100s as their own probabilities | Two extra parameters (the probability of exactly 0 and of exactly 100) |
| 21 | How the browser computes a student's posterior | Closed-form Normal shrinkage; coordinate descent; MCMC in the browser; Laplace approximation | Laplace with damped Newton steps, a curvature check, and parity tests against full MCMC | Closed-form shrinkage is exact only for bell-shaped likelihoods (ours are beta and logistic). Coordinate descent finds the peak but gives no uncertainty. MCMC is slow and hard to test in a popup. Laplace = peak + curvature, which is the uncertainty the predictions need | Understates uncertainty when the posterior is skewed (few grades near 100%); checked against NUTS and widened if needed |
| 22 | How spacing is counted | Integer count of study days; two-tier integer program; soft day count | Soft count: each day adds min(1, minutes / 30), in both model and planner | The integer count made the planner's objective jump, breaking the greedy guarantee. The soft count is concave, so the plan is solvable exactly, and 5 minutes no longer counts as a full study day | Model must be refit; whether soft beats integer is tested by held-out prediction |
| 23 | Planner solver | Greedy only; integer program; convex program | Convex program solved by projected gradient ascent; greedy kept as the fast "what now" heuristic and tested against it | With the soft count the objective is concave and the constraints are linear, so \~300 variables solve exactly in milliseconds in the browser | A little more code than greedy alone |
| 24 | What OULAD is used for | All priors; shape only; shape plus parameters measured in days | Curve shape (κ in normalized units), spacing and lead time; the size of the study effect (β) gets only a weak prior | Clicks are not hours, so OULAD cannot set β's scale (measurement non-equivalence). Spacing and lead time are measured in days in both datasets, so they transfer, with wider priors for the population difference (transportability) | In v1 the start-date curve's shape is well supported but its height is uncertain; intervals are honestly wide |
| 25 | Gemini Nano input size | Whole slide pages; \~300-word concept blocks with runtime checks | \~300-word blocks, one fresh session each, checked with measureContextUsage() before sending | The context window is small and when it overflows the oldest content is dropped or the call fails. No browser flags are needed for extensions (Chrome 138+); that advice was outdated | More prompts per module; slightly slower quiz generation |

## The model at a glance

Three layers of hidden skill add up to one module skill, and that skill drives every exam, assignment and quiz the student sees.

&#91;embedded content: model structure · 3 skill layers, 3 observation types, priors\]

Read it top to bottom to see how the model imagines grades are produced; the browser's update after each grade runs the same arrows in reverse to work out the skill.

## Defending each model component

The whole model in one sentence: each student has a hidden skill level per course and per module, every grade and quiz answer nudges it, and study time, spacing and starting early raise the expected score with diminishing returns. Each piece below is explained in plain words, with the alternative it beat and the answer to the question you'll most likely get.

### 1. Hidden skill, in layers (the hierarchy)

**What it is.** Your skill in a module = your general strength (θ) + how you do in this course (u) + how you do on this module (v). Each layer starts at an average and moves only as far as your own evidence justifies.

**Why not estimate each course separately?** With 2–3 grades in a course, a separate estimate swings wildly. Layering borrows strength: early on you look like the average student, and your own data takes over as it arrives. The weight on your own data is roughly n / (n + σ²/τ²), where n is your number of grades, σ is how noisy one grade is, and τ is how much students genuinely differ; it rises from about 0.4 after one grade to about 0.84 after eight (illustrative σ = 10, τ = 8 points).

**If asked "why hierarchical?":** "Sparse data per student is exactly where partial pooling wins. Gelman showed multilevel models beat both complete and no pooling on cross-validated prediction, and I check the same thing with leave-one-out on my data."

### 2. Scores between 0 and 1, including exact 0 and 100 (ZOIB)

**What it is.** A score is a fraction from 0 to 1. The model predicts its average through a logit link, which turns any number into something between 0 and 1. Exact 0% and exact 100% get their own probabilities, because many assignments are full marks.

**Why not a normal (bell-curve) model on percentages?** It would predict impossible scores above 100% and below 0%. Why not apply the logit to the score itself? logit(100%) is infinite. That was a real bug in v1, fixed in decision 20.

**If asked:** "Grades are bounded and pile up at 100, so I use a zero-and-one inflated beta. The link function transforms the predicted mean, never the observed score."

### 3. Diminishing returns: 1 − e^(−hours/κ)

**What it is.** The first hour of study helps most; each extra hour helps less, and the gain levels off. κ is the number of hours to get about 63% of the maximum possible gain.

**Why not a straight line?** A line says the 20th hour helps as much as the 1st, which nobody believes. Why this curve rather than log(1 + hours)? Individual learning curves fit an exponential better than a power law (Heathcote et al. 2000). That evidence is about practice speed, not grades, so both curves are fit and the data decides.

**If asked:** "I didn't assume the curve; I compared two shapes by held-out prediction and kept the winner."

### 4. Spacing: soft count of study days

**What it is.** Each day you study adds up to one "study day," and a day only counts fully after 30 minutes: min(1, minutes/30). More study days at the same total hours predicts a higher score.

**Why soft?** A plain count let 5 minutes count as a full day, and it made the planner's math jumpy (decision 22). The soft count fixes both.

**If asked "is spacing real?":** "It's one of the best-replicated effects in learning research: 839 assessments across 317 experiments (Cepeda et al. 2006), and rated high utility by Dunlosky et al. The caveat: it's weaker for problem-solving tasks, so the effect size varies by course in my model."

### 5. Starting early (lead time) for assignments

**What it is.** Days between finishing and the due date, from Canvas history and the timer. Earlier finishing predicts higher assignment scores.

**If asked:** "In CS courses, students who start and finish earlier get better grades (Edwards et al. 2009, 1,101 students). The average procrastination effect across studies is small, around r = −.13 (Kim & Seo 2015), so I don't oversell it."

### 6. Quizzes: skill minus difficulty

**What it is.** The chance you answer a question right = a logistic function of (your module skill − the question's difficulty). This is the Rasch idea used in standardized testing and in student models like Performance Factors Analysis.

**Why quizzes at all?** Hours alone barely predict grades (Plant et al. 2005); a quiz measures understanding directly, and taking it also helps you learn (Roediger & Karpicke 2006).

**If asked "machine-generated questions are unreliable":** "Agreed, so I filter with a self-check, let students report bad questions, hand-check a sample, and report the error rate. And I test whether quizzes improve exam prediction at all."

### 7. Where the starting numbers come from (priors)

**What it is.** Course difficulty and spread come from UBC Grades history and Canvas class statistics. The curve shape, spacing and lead-time effects come from OULAD, a public dataset of 32,593 students. The size of the study effect gets only a weak prior because clicks aren't hours (decision 24).

**The right name for it:** empirical Bayes at the population level (priors fit from data offline), full Bayes at the student level.

**If asked "OULAD is a different population":** "Yes, that's a transportability problem, and clicks aren't hours, which is measurement non-equivalence. So I only use OULAD for parameters measured in days or for the curve's shape, and I widen those priors."

### 8. Updating in the browser (Laplace approximation)

**What it is.** After each new grade, find your most likely skill values (the peak) and how sharply the evidence pins them down (the curvature). Together they give a bell-curve summary of your uncertainty. It takes milliseconds.

**Why not the alternatives?** Closed-form shrinkage only works for bell-shaped likelihoods; ours aren't. Coordinate descent finds the peak but not the uncertainty. Full MCMC is slow and hard to test inside a popup (decision 21).

**If asked "is the bell-curve summary accurate?":** "Not always: with few grades near 100% the true posterior is skewed. So I test the browser's answers against full MCMC (PyMC's NUTS sampler) on fixtures, and widen intervals if they come out too narrow."

### 9. Predictions and "what now"

**What it is.** For a plan (start date, minutes per day), the model simulates many possible outcomes and reports the share that hit your target. "What now" draws one plausible version of your skills (Thompson sampling) and picks the block with the biggest expected gain.

**Why sample instead of using the average?** Sampling sometimes favours modules the model is unsure about, so it learns where you actually stand. Thompson sampling is simple and competitive with the best methods (Chapelle & Li 2011).

### 10. The planner

**What it is.** Split each day's available time across all courses to maximize your total expected weighted grade. With the soft spacing count the problem is concave, so it is solved exactly as a small convex program; greedy remains as a fast heuristic (decision 23).

**If asked "why is greedy justified?":** "Greedy by marginal gain is optimal for one budget with diminishing returns (Fox 1966). Across many days with spacing it's only approximate, so I solve the exact convex version and test greedy against it."

### What the model does not claim

- It is **not causal.** Weaker students study more, so the predictions mean "students like you," not "studying X hours will cause Y."
- The **size of the study effect is uncertain** in v1, so intervals are wide.
- **Pilot data is small** (about 5 people). It validates the pipeline; it can't fit course-level effects.

## Hard questions to rehearse

These are the questions a statistics-minded interviewer or your instructor is most likely to push on. Answer in your own words; the notes are the substance.

| Question | Answer in one breath |
| --- | --- |
| Why Bayesian instead of a regular ML model? | Very little data per student, and the product needs uncertainty (a probability of hitting a target), not just a point guess. Priors let a new student get sensible predictions on day one. |
| Why not deep knowledge tracing or a neural model? | Those need thousands of question-level attempts per course. I have a handful of grades per student; a small hierarchical model is the right tool for that data. |
| With five pilot users, isn't this overfit? | The pilot doesn't fit the population parameters; those come from UBC Grades and OULAD. The pilot only tests the pipeline and personal updates, and I say so in the report. |
| How do you know it's accurate? | Three ways: leave-one-out comparison across six model variants, temporal holdouts on UBC Grades and OULAD, and predictions frozen before grades were released and scored afterwards (Brier score, calibration plot). |
| What's the single weakest part? | The size of the study-time effect: OULAD measures clicks, not hours, so that number is uncertain and the intervals are wide. That's why the quiz signal matters. |
| Doesn't studying more correlate with lower grades? | Yes, because weaker students study more. Comparing each student with themselves across items reduces that, and the product never claims causation. |
| What if students leave the timer running or lie? | Idle detection, editable sessions, and the model weights hours weakly anyway; quizzes and grades carry most of the signal. |
| Why is the planner's answer trustworthy? | The objective is concave after the soft spacing fix, so the convex solver finds the true optimum; tests compare greedy to it. |
| Why not collect everyone's data? It would be more accurate. | Small classes make re-identification easy (a classmate could diff nightly parameters). Canvas statistics give most of the benefit with none of the risk; donation comes in v2 with one release per year. |
| Is the Laplace approximation good enough? | For a few dozen parameters, usually; it can understate uncertainty when grades sit near 100%. I test it against full MCMC and widen intervals if needed. |

**Words to use precisely:** partial pooling, posterior, prior, likelihood, link function, calibration, held-out prediction, transportability, measurement non-equivalence, concave.

## Themes for the presentation and interviews

The decisions group into four stories, each a ready answer to "tell me about a tradeoff you made."

1. **Privacy by architecture, not by policy.** Pooling student data looked necessary for accuracy. The re-identification analysis (a classmate diffing nightly parameters) showed the risk, and Canvas statistics plus UBC Grades replaced most of what pooling offered. Result: no backend, no collection, and a v2 donation design that releases once a year. *Decisions 8, 9, 14, 19.*
2. **Evidence before features.** Every model term cites research, rates how well that research transfers, and must earn its place by held-out prediction (PSIS-LOO). The headline question, whether quiz accuracy beats study hours as a predictor, came from the finding that raw study time barely predicts grades. *Decisions 5, 6, 7, 10.*
3. **Scope down to the valuable slice.** RAG shrank from a chatbot to module quizzes, because quizzes feed the model and chat doesn't. Redis was rejected twice for lack of a real need. *Decisions 4, 11, 13.*
4. **Ship data collection first.** The model is only as good as its data, so logging went live in Week 9 and predictions were frozen before grades for honest prospective evaluation. *Decisions 17, and the evaluation plan in the design doc.*

**Limitations to state up front:** the study-time effect comes from a different population (OULAD), the pilot is small, and Gemini Nano's question quality is measured rather than assumed.
