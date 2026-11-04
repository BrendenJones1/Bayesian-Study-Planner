# Bayesian Study Planner — System Design v2

Nov 3, 2026 · @Brenden

## Overview

Each night the planner picks a study action for every course with an upcoming exam (an intense 5-hour block, a light 1-hour review, or rest) by comparing each action's expected utility: the chance of reaching a grade target, minus a stress cost. A discrete Bayesian network computes both, using tables learned by counting from three public datasets and your own Canvas data.

- **Users:** UBCO students, through a Chrome extension on Canvas. No daily "feel" inputs: evidence comes from Canvas and the Start-studying timer.
- **Two models are presented side by side:**
  - The **baseline** uses population tables only.
  - The **personalized** model adds a personal offset learned from your graded work. The difference between them is the project's main result.
- **Rubric:** the 2-person option done solo. That's an expanded network, 6 CPTs learned from CSVs with Laplace smoothing, hand-built CPTs with explanations, inference with pgmpy's variable elimination, 3 actions, a utility over exam success and stress, calendar output, and simulated student scenarios.
- **What changed from v1:** the continuous hierarchical model, Laplace approximation, convex planner and on-device quizzes moved to future work (see the v1 design doc). Every number in v2 is a count, a sum or a product, or a stated assumption with a sensitivity check.

## Architecture

Learning happens once, offline, in Python. Inference happens daily, in the browser, on the student's own data. No student data leaves the device, except free/busy queries to the student's own Google Calendar and the study blocks written back to it.

1. **Build CSVs (Python, pandas).** Discretize OULAD, UBC Grades and StudentLife into one CSV per learned table, committed to the repo.
2. **Learn CPTs.** Laplace-smoothed counts, written to `cpts.json`.
3. **Graded notebook (pgmpy).** Builds the network from `cpts.json`, runs `VariableElimination` for every query, the personas and the evaluation. This is the rubric's built-in inference.
4. **Publish.** `cpts.json` goes to GitHub Pages (the existing `priors.json` pipeline, new payload).
5. **Extension (TypeScript).** Reads Canvas (GET only), the timer and `cpts.json`. It runs the same queries by exact enumeration, checked against pgmpy by golden-vector parity tests in `shared/fixtures/`.
6. **Nightly, on the device.** `chrome.alarms` re-counts the personal offset when a new grade appears, reads tomorrow's available hours (Google Calendar free/busy, or the manual setting), re-runs both models, and writes the chosen study blocks to the calendar.

## Data sources

Three public datasets each answer one question. Canvas supplies the student's evidence at query time.

| Source | What it is | Answers | Caveats |
| --- | --- | --- | --- |
| [OULAD](https://archive.ics.uci.edu/ml/datasets/Open+University+Learning+Analytics+Dataset) | 30,000+ students in 7 Open University (UK) modules: assessment scores and dates, daily VLE clicks, final results. CC BY 4.0. | How prior performance, study and timeliness move a student's class standing | Distance learners, not UBC. Clicks are a proxy for study. Pass mark is 40, so only ranks transfer. Some values missing. |
| [UBC Grades (PAIR)](https://github.com/DonneyF/ubc-pair-grade-data) | UBCO section grade distributions 2021–2025 in letter-grade bins (7,255 winter sections with 10+ students) | What grade a class standing gives in a specific UBCO course; course difficulty | Aggregates only, no individual students. Course averages drift year to year (correlation about 0.77). |
| [StudentLife](https://studentlife.cs.dartmouth.edu/dataset.html) | 48 Dartmouth students, one 10-week term (2013): repeated stress self-reports, daily deadline counts | How workload relates to stress, and how stress carries over day to day | Small, one US school, self-reported. Students skip surveys on their busiest days. |
| Canvas (the student) | Grades, class statistics (mean, quartiles), due dates, submission times, assignment weights | All evidence for the query | Instructors can hide class statistics. Fallbacks below. |
| Google Calendar (the student) | Free/busy times only: no event titles or details | Available hours each day | Needs Google sign-in, and is an exception to the no-network rule, limited to the student's own account. Optional: manual availability can be used instead. |
| Start-studying timer | Minutes per course per day | Study so far | Optional. If unused, the network averages over it. |

**Exam dates, coverage and weights from Canvas.** Read-only, with every guess one click to confirm or edit:

1. **Dates.** Taken from Canvas assignments and calendar events first. Then the syllabus and announcement text is searched for date patterns next to "midterm", "exam", "final" or "quiz". Each match is proposed for one-click confirmation. Gemini Nano extraction is a stretch goal.
2. **Coverage.** A pattern such as "Modules 4–7" in the syllabus or an announcement sets which concepts an exam covers. Default: the modules released since the previous exam. Coverage decides which concepts feed concept difficulty and mastery.
3. **Weights and type.** Assignment-group weights (`group_weight`) give each item's share of the course grade. Group names (exam, midterm, quiz, assignment, lab) give its type. Only exams and major projects get study blocks; weekly homework doesn't.

## Network

The network has 23 nodes for an exam covering 3 concepts. Concept difficulty reaches the decision through exam difficulty, which the learned standing table combines with study. That's how different concept difficulties lead to different actions.

&#91;embedded content: network structure · grade path (left), stress path (right)\]

Arrows point from parent to child. Perf and Item weight also feed Final standing, and Graded so far selects which Final-standing table is used. These are left out of the picture to keep it readable.

| Node | Values | Parents | CPT from |
| --- | --- | --- | --- |
| Concept difficulty D₁–D₃ | Easy / Med / Hard | — | Evidence: class mean on the module's graded items vs the course mean (±5 points). No graded items: Med. |
| Mastery M₁–M₃ | Low / Med / High | — | Evidence: your class percentile on that concept's graded items. Ungraded: set equal to your course standing. |
| Exam difficulty | Easy / Med / Hard | D₁–D₃ | Hand-built, deterministic: mean of the levels, rounded |
| Perf | Low / Med / High (thirds of class) | M₁–M₃ | Hand-built, deterministic: mean of the levels, rounded |
| Timeliness | On time / Some late / Often late or missing | — | Evidence: Canvas `submitted_at`, `late`, `missing`. Cut points from OULAD's distribution. |
| Study so far | Low / Med / High | Perf | **Learned, OULAD.** Evidence when the timer was used. |
| Days left | 1–2 / 3–7 / 8+ | — | Evidence: the exam date (see Data sources) |
| Graded so far | 25% / 50% | — | Evidence: weights of the graded Canvas items. The table used is the highest checkpoint not above the graded share (the 25% table below 25%), so more than half graded uses the 50% table. |
| Item weight | ≤15% / >15% of the course grade | — | Evidence: Canvas assignment-group weights, split across the group's items |
| Load | Low / Med / High | — | Two nodes, today and tomorrow. Evidence: Canvas deadlines in the next 3 days. Cut points from StudentLife's thirds. |
| Action | Intense 5 h / Light 1 h / Rest | — | Decision, one per course per day |
| Study before the exam | Low / Med / High | Study so far, Action, Days left | Hand-built rule (Prediction section) |
| Exam standing | Deciles 1–10 | Perf, Study before the exam, Timeliness, Exam difficulty | **Learned, OULAD** (assessment level) |
| Personal offset | −2 to +2 deciles | — | **Learned, your graded items.** Personalized model only. |
| Final standing | Deciles 1–10 | Perf, Exam standing (after offset), Item weight, Graded so far | **Learned, OULAD.** One table per checkpoint (25% and 50%). |
| Grade | UBC letter-grade bins | Final standing, course | **Learned, UBC Grades**, averaged across years, then bounded by what's still achievable |
| Stress now | Low / Med / High | Load | **Learned, StudentLife.** Set as evidence if the student taps a level. |
| Stress next | Low / Med / High | Stress now, Load tomorrow (+ study hours) | **Learned, StudentLife**, plus one assumed parameter |

Query variables: **Grade** (for P(grade ≥ target)) and **Stress next** (for the stress cost).

## Prediction

OULAD and UBC Grades are never averaged or weighed against each other. OULAD predicts *where you finish in your class*; UBC Grades says *what grade that position gives in this UBCO course*. They connect only through two quantities defined identically in both: **class standing** (a percentile) and **difficulty relative to the same school**. Matching scales by percentile is standard equipercentile linking (Kolen & Brennan, *Test Equating, Scaling, and Linking*). Raw scores can't be matched, because OU's pass mark is 40.

**Baseline model** (e = evidence, a = action):

```latex
P(\text{grade} \ge t \mid e, a) = \sum_{s_x} \sum_{s_f} P(s_x \mid \text{perf}, \text{study}(a), \text{timeliness}, \text{examdiff}) \; P_g(s_f \mid \text{perf}, s_x, w) \; P(\text{grade} \ge t \mid s_f, \text{course})
```

In words: predict your decile on the upcoming exam, s\_x. Turn that into your final course decile s\_f at checkpoint g, given the exam's weight w, then read off the chance that s\_f gives a grade of at least t.

- **Targets** can be any UBC letter boundary: 50, 55, 60, 64, 68, 72, 76, 80, 85 or 90.
- **Grade map:** each year's distribution for the course is sliced into deciles separately, and the years 2021–2025 are averaged. That turns year-to-year drift into honest uncertainty. In MATH 100, for example, P(≥ 80 | decile 7) = 0.70 across years. Courses with under 2 years of data use the pooled distribution for their difficulty group: average under 75.3 is Hard, 75.3–81.0 is Medium, 81.0+ is Easy.
- **Study before the exam** (hand-built rule): keep your recent pace for the remaining days, then add today's action (5 h, 1 h or 0). Volume and active days are each bucketed. Volume cuts are anchored at about 3 h per course per week, from Babcock & Marks (2011): about 14 h/week across a full course load. Active-day cuts come from OULAD's thirds. The two bucket levels are summed (0–4): 0–1 is Low, 2 is Med, 3–4 is High.
- **Perf** is your weighted mean class percentile on graded items. Each item's percentile is interpolated from its Canvas quartiles. If class statistics are hidden, your score is placed against the course's historical distribution instead (weaker).
- **The transfer assumption:** study behaviour moves class standing the same way at the OU and at UBCO. It can't be proven from this data. The personal offset partly corrects for it as the term goes on.

**Bounds from what's still achievable.** Before any inference, simple arithmetic on your current weighted score c, the graded weight G and the remaining weight R = 1 − G:

```latex
c \, G + 1.00 \cdot R < t \;\Rightarrow\; P(\text{grade} \ge t) = 0, \qquad c \, G + 0 \cdot R \ge t \;\Rightarrow\; P(\text{grade} \ge t) = 1
```

A target that's out of reach or already locked in gets no study time, and the reason is shown to the student. Between the two bounds, the network's answer is used as computed.

**Weights across schools.** OULAD scores coursework and the exam as separate components. Item weight is therefore converted to *share of the final grade* within each OULAD module before bucketing, and noted as a limitation.

## Learning the CPTs

Every learned table is a count of rows in a CSV, smoothed with Laplace (add-one) smoothing:

```latex
\hat P(X = x \mid \text{pa} = u) = \frac{N(x, u) + \alpha}{N(u) + \alpha \, |X|}, \qquad \alpha = 1
```

Worked example: 412 OULAD rows with (Perf High, Study High, On time, Exam Hard), 78 of them in decile 8, gives (78 + 1)/(412 + 10) = 0.187.

| CSV | Rows | Learned table | Free parameters |
| --- | --- | --- | --- |
| `oulad_exam_standing.csv` | One per student × assessment | Exam standing \| Perf, Study, Timeliness, Exam difficulty | 81 parent combinations × 9 = 729 |
| `oulad_final_standing_g{25,50}.csv` | One per student, per checkpoint | Final standing \| Perf, Exam standing, Item weight | 60 × 9 = 540 per table |
| `oulad_study.csv` | One per student × assessment | Study so far \| Perf | 3 × 2 = 6 |
| `ubc_grade_bins.csv` | One per course × year × bin | Grade \| decile, course (averaged across years) | Exact slices; nothing to smooth |
| `studentlife_stress_now.csv` | One per stress response | Stress now \| Load | 3 × 2 = 6 |
| `studentlife_stress_next.csv` | One per consecutive pair of responses | Stress next \| Stress now, Load tomorrow | 9 × 2 = 18 |

**Rules for building the CSVs:**

- **No leakage.** Perf, Study and Timeliness use only assessments *before* the one being predicted. The standing outcome uses that assessment, or the final result, only.
- **Thirds and deciles within each class.** Ranks are computed per module presentation (OULAD) or per course offering (UBC), so the levels mean the same thing across schools.
- **Withdrawals excluded** in OULAD, matching UBC distributions, which contain no W's.
- **Two checkpoints, 25% and 50%.** A checkpoint is the share of the final grade already graded before the assessment being predicted. In OULAD the final exam is about half of the grade, so no module has 75% graded before it and a 75% table would have no rows. A student with more than half graded uses the 50% table.
- **Stress recoding.** Check StudentLife's stress answer labels against `EMA_definition.json` before recoding into Low / Med / High.
- **Sparse cells.** If any Exam-standing row has fewer than about 30 students, try quintiles instead of deciles. Keep whichever scores better on held-out log-loss.
- **Hand-calculable.** Two or three entries per table are worked by hand in the report and checked against pandas and pgmpy.

## Personal offset (the personalized model)

The offset O ∈ {−2, −1, 0, +1, +2} deciles is how far you tend to land above or below what the baseline predicts for students with your evidence. It's one table shared across all your courses, so a midterm in one course informs the others.

```latex
P(O = k) = \frac{m \, p_0(k) + N_{\text{you}}(k)}{m + N_{\text{you}}}
```

- **p₀(k):** how often OULAD students' actual exam decile differs from the baseline's prediction by k. A plain count over the OULAD back-test.
- **m:** how many graded items' worth of trust the prior gets. It's chosen by back-test, not guessed. Try m ∈ {1, 2, 5, 10, 20, 50}, predict each OULAD student's later assessments from their earlier ones, and keep the m with the lowest log-loss. The same back-test checks whether offsets carry across modules for students who took more than one.
- **N\_you(k):** your graded items whose residual (actual decile − baseline's predicted decile, clipped to ±2) equals k.

**Nightly recalculation**, when Canvas shows a new grade:

1. Rebuild the baseline's prediction for that item, using only the evidence available before its due date. Take the most likely decile.
2. Read your actual decile from the item's class quartiles.
3. Add one count at the residual, then recompute P(O).
4. Re-run every course. The exam-standing distribution is shifted by P(O) (mass past decile 1 or 10 is kept at the edge), then passed through final standing, the grade map and the decision.

Residuals are always measured against the **baseline**, never the personalized model, so the offset can't feed on its own output. The extension shows both models side by side, which is the ablation the presentation is built around.

## Stress

Stress affects only which action is chosen, through the utility. It never changes P(grade). Both stress tables are learned from StudentLife, and one parameter is assumed and swept.

- **Load:** the number of Canvas deadlines (assignments, quizzes, exams) in the next 3 days, across all courses. It's bucketed by StudentLife's own thirds, because StudentLife's `deadlines.csv` counts deadlines per student per day: summing today and the next two days gives the same quantity as the Canvas count. Counting single days does not work, since 79% of student-days have no deadline and both thirds fall on 0. Measured cut points: Low is 0 deadlines in the window, Med is 1, High is 2 or more.
- **Stress now | Load:** learned from StudentLife responses paired with that day's deadline count. If the student taps a stress level, that becomes evidence, the same quantity StudentLife measured. No tap: the network infers it from Load.
- **Stress next | Stress now, Load tomorrow:** learned from each student's consecutive responses. This is how stress carries over from one day to the next.
- **The one assumption:** StudentLife has no study-hours data, so the action's effect is a single parameter θ. Each study hour today adds θ deadline-equivalents to tomorrow's load before the lookup: Intense adds 5θ, Light 1θ, Rest 0. Default θ = 0.2, so 5 hours of study counts as about one deadline and an Intense day adds one deadline to tomorrow's load. The report shows decisions for θ ∈ {0, 0.1, 0.2, 0.3}.
- **Why stress doesn't change grades:** no dataset in hand lets us learn that relationship. StudentLife has only term GPA for 48 students. Test-anxiety research reports a modest negative correlation, but its causality and transfer are unclear. Listed under limitations.
- **Check for the report:** how well Load alone predicts reported stress in StudentLife, as log-loss against guessing the overall rate.

## Decision

Each night the system re-plans the next day. It scores every combination of actions across the courses with an exam or major project in the next 14 days, and keeps the plan with the highest expected utility that fits in your available hours. The resulting blocks go on the calendar.

```latex
EU(a) = 100 \, P(\text{grade} \ge t \mid e, a) \; - \; \lambda \cdot 100 \, \mathbb{E}[\tilde s_{\text{next}} \mid e, a], \qquad \tilde s \in \{0, 0.5, 1\} \text{ for Low, Med, High}
```

**Available hours H for tomorrow** come from one of two sources, chosen in settings:

| Setting | How H is computed |
| --- | --- |
| **Read from Google Calendar** (default once connected) | Google's free/busy query for tomorrow, within your study window (e.g. 9:00–22:00). H = min(F, M). F is tomorrow's free time inside your study window, counting free blocks of at least 1 hour; one action's hours may be split across them. M is your daily maximum: default 6 h, minimum 5 so Intense stays possible. The planner's own study blocks are tagged when written and not counted as busy. |
| **Manual** | Weekly availability (e.g. 2 h weekdays, 4 h weekends), minus any busy blocks you add, capped at M |

If Google can't be reached, the planner uses the manual setting for that night and says so.

- **Actions, per course per day:** Intense (5 h), Light (1 h), Rest. A day's plan combines them across courses, for example Intense for MATH 100 plus Light for COSC 121.
- **λ is a preference, not a fact.** It's a one-time setting: Grades first, Balanced or Wellbeing first. In decision theory, probabilities come from data and utilities come from the person deciding. The report shows how the choice changes across λ.
- **Exhaustive search over plans.** With n courses (at most 7, usually 5 or fewer) there are 3^n plans: 243 for 5, 2,187 for 7. The day's utility is the sum over courses minus one shared stress cost:

  ```latex
  U(a) = \sum_c 100 \, P_c(a_c) - \lambda \cdot 100 \, S(h), \qquad h = \sum_c a_c \le H
  ```
  1. For each course, compute P\_c for each of its 3 actions (3n queries).
  2. Compute S(h) = E\[stress next | stress now, Load tomorrow + θh\] for each total h from 0 to H.
  3. Add these up for every plan with h ≤ H, and keep the best. That's additions, not new inference, so it's instant. The result is exactly optimal for the model.
- **Why not greedy:** greedy marginal allocation (Fox 1966) is only guaranteed optimal when gains shrink in equal steps. Our steps are 1 h and +4 h. In a worked example with H = 6, greedy chose Light for all three courses (utility 9.6), while the best plan was MATH Light + COSC Intense (11.2).
- **Several exams over several days:** re-planning nightly with new evidence (receding horizon). Every exam in the window competes for each day's hours, so a later exam in a cluster gets time early whenever its gain is larger. No multi-day solver is needed. Limitation: it's myopic, and won't rest today to keep tomorrow free. A two-day lookahead is a stretch goal.
- **Crunch warning (stretch):** for each possible start day d, compute P(target | start studying on d). Flag the latest start date that still clears the target: "start MATH 100 by Nov 12 to stay above 80%."
- **Calendar:** each block becomes an event in Google Calendar, using the same sign-in as free/busy. If Google isn't connected, the planner exports an `.ics` file instead. It never writes to Canvas, including Canvas's personal calendar (Canvas is read-only, CLAUDE.md rule 2). Pending the instructor's approval.
- **Worked example (placeholder OULAD rows, real MATH 100 grade map):** target ≥ 80, 6 days left, Perf High. P(≥ 80) is 0.599 for Rest, 0.623 for Light and 0.667 for Intense. With λ = 0.4, Rest wins, at 50.9 vs 46.3 vs 40.7. Intense would win only if λ < 0.16.

## Evaluation

Every claim is checked on data the model didn't learn from. The main result is a comparison of three models: course history only, the baseline, and the baseline plus offset.

| Test | Data | Metric | Shows |
| --- | --- | --- | --- |
| Held-out learned tables | 20% of OULAD students, split by student | Log-loss and accuracy vs the course-history-only model | The network beats the trivial baseline |
| Offset back-test | OULAD students with 4+ assessments, in date order | Log-loss of later assessments, baseline vs baseline + offset; choice of m | Personalization helps, and by how much |
| Grade-map stability | UBC Grades: difficulty from 2021–23, outcomes from 2024–25 | P(grade ≥ t \| difficulty). Done: 72% of students in Easy courses reach 80+, against 35% in Hard. | Difficulty labels predict later years |
| Stress tables | StudentLife, split by student | Log-loss vs the overall rate | How much Load explains |
| Personal replay | Your Canvas term so far, replayed in date order. Past terms too, if Canvas still shows them. | Item-level log-loss for all three models; P(target) plotted over the term | The case study (n = 1) |
| Personas | Simulated students: struggling, advanced, overloaded, far from the exam | The chosen action as concept difficulty, λ and θ vary | Different concept difficulties lead to different actions (rubric) |
| Smoothing | All learned tables | Results at α ∈ {0, 1, 5} | Why smoothing matters (α = 0 breaks on empty cells) |

The replay gives the model only grades released before each date, then predicts the next item. If future grades leak in, the result is invalid. OULAD provides the statistical evidence; the replay is the story told in the presentation.

## Assumptions and limitations

Five numbers are assumed rather than learned. Each one has a sensitivity check in the report.

| Assumption | Value | Basis | Sensitivity check |
| --- | --- | --- | --- |
| Concept-difficulty threshold | ±5 points from the course mean | Hand-set | ±3 and ±8 |
| Study-volume anchor | About 3 h per course per week is the middle third | Babcock & Marks (2011): about 14 h/week of study across a full course load | Anchor ±50% |
| Item-weight cut | 15% of the course grade | Hand-set: separates quizzes and assignments from midterms and finals | 10% and 20% |
| Study hours' effect on stress, θ | 0.2 deadline-equivalents per hour (5 h ≈ 1 deadline) | Author's judgment (5 h of study feels like one deadline); no data | 0, 0.1, 0.2, 0.3 |
| Stress weight, λ | Student's setting | A preference, not a fact | Full range |

**Limitations:**

- **Transfer.** OULAD is UK distance learners; StudentLife is 48 Dartmouth students in 2013. Only relative measures (ranks, thirds) are carried over.
- **Observational data.** P(standing | study) is learned from students who chose how much to study. Using it as the effect of an action is an assumption. Conditioning on Perf adjusts for part of the confounding, so UI copy says "students like you", never "you will".
- **Stress doesn't change grades** in this model, only the choice of action.
- **Canvas dependence.** Hidden class statistics weaken Perf and stop the offset from updating in that course.
- **Approximation.** Averaging per-item percentiles only approximates your percentile on the course total.
- **Late-term standing.** OULAD has no checkpoint beyond 50% graded, so a student with 75% or more graded is predicted with the 50% table. The remaining exam's weight still enters through Item weight.
- **The personal replay has n = 1** and is presented as a case study.

## Out of scope and future work

- **Attendance.** No dataset measures it, and any effect size would need an invented number. Credé et al. (2010) is the place to start if it comes back.
- **On-device quizzes (Gemini Nano).** These would add a quiz-score node under each Mastery node, for early-term mastery evidence and retrieval practice.
- **From the v1 design** (see the v1 system design doc): the hierarchical continuous ability model, the zero-and-one inflated beta likelihood, Laplace updates in the browser, the convex multi-day planner and Thompson sampling. v1 recovers what v2 gives up: minute-level schedules, richer parameter uncertainty and exploration.
- **A course-level stress effect on grades,** if a dataset that links the two becomes available.

* **Stretch: hours 0–5 per course.** The action becomes the number of hours per course per day (0–5), with Rest, Light and Intense kept as 0, 1 and 5. That allows plans like 3 h on MATH and 2 h on COSC, and removes the 1 h vs +4 h step mismatch that makes greedy miss the best plan. Search every plan exactly: 6ⁿ plans, at most 279,936 for 7 courses and still instant once each course's 6 values are computed; or a knapsack-style dynamic program over total hours. Pair this with splitting the Load evidence between neighbouring buckets (soft evidence). Then each extra hour has a steady stress cost, instead of none until the load crosses a bucket edge and a jump when it does. Cost: about 6n + 7 queries a night, the Study-before-the-exam rule grows from 27 to 54 rows, and no learned table changes.

## Sources

- [OULAD, UCI Machine Learning Repository](https://archive.ics.uci.edu/ml/datasets/Open+University+Learning+Analytics+Dataset)
- [UBC PAIR grade data (UBCO 2021–2025)](https://github.com/DonneyF/ubc-pair-grade-data)
- [UBC Grades API reference](https://lcfyi.github.io/ubcgrades/api-reference/)
- [StudentLife dataset](https://studentlife.cs.dartmouth.edu/dataset.html)
- [Wang et al. 2014, StudentLife (UbiComp)](https://www.cs.columbia.edu/~xia/publication/ubicomp14-studentlife/ubicomp14-studentlife.pdf)
- Kolen & Brennan, *Test Equating, Scaling, and Linking* (Springer): equipercentile linking
- Babcock & Marks (2011), "The falling time cost of college", *Review of Economics and Statistics*: student study hours
- Credé, Roch & Kieszczynka (2010), "Class attendance in college", *Review of Educational Research*
