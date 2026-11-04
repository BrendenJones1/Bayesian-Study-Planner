# Bayesian Study Planner — v2 Decision Log

Each row's Why cell cites the `docs/design-v2.md` heading it comes from, written as `§ Heading`.

| # | Decision | Options weighed | Chosen | Why | Cost accepted |
| --- | --- | --- | --- | --- | --- |
| 1 | Counting instead of a continuous model | Hierarchical continuous ability model with Laplace updates; counted tables | Counted tables | Every number is a count, a sum or a product, so each can be checked by hand. § Overview; § Learning the CPTs | No minute-level schedules or richer parameter uncertainty (parked as v1 future work) |
| 2 | Laplace smoothing | No smoothing (α = 0); α = 1; larger α | α = 1 on every learned table | No zero entries, so no evidence combination is impossible. § Learning the CPTs | Sparse cells are pulled toward uniform |
| 3 | A discrete network | Continuous variables; discrete thirds, deciles and 3-level nodes | Discrete network | Counts and exact enumeration need discrete states. § Network | Information lost at bucket edges |
| 4 | pgmpy plus TypeScript enumeration | pgmpy only; a JS inference library; own enumeration checked against pgmpy | pgmpy in the notebook, exact enumeration in the extension, golden-vector parity | pgmpy is the graded inference; the extension must run offline on the device. § Architecture | Two implementations to keep in parity |
| 5 | OULAD and UBC joined only by class standing | Pool raw scores; join on class standing and relative difficulty | Class standing only | The datasets differ in country, scale and grading. § Data sources; § Learning the CPTs | Absolute score levels never transfer |
| 6 | Stress affects the action only | Stress lowers P(grade); stress enters only the utility | Utility only | No dataset links stress to grades. § Stress; § Assumptions and limitations | The model cannot say stress hurts grades |
| 7 | The personal offset with a back-test-chosen m | Fixed m; no personalization; m chosen by OULAD back-test | m chosen by back-test over {1, 2, 5, 10, 20, 50} | The prior's weight is set by data, not guessed. § Personal offset (the personalized model) | The offset is one table shared across courses |
| 8 | Exhaustive search instead of greedy | Greedy marginal allocation; knapsack; every plan | Every plan (3^n, at most 2,187) | Greedy is not optimal when steps are 1 h and +4 h. § Decision | Myopic across days |
| 9 | The Google Calendar exception | No calendar; `.ics` only; Google Calendar after Connect | Free/busy and the planner's own events, after the student clicks Connect, with `.ics` as fallback | Available hours and the schedule are the output students use. § Architecture; § Decision | The only network calls to a host other than Canvas and `cpts.json` |
| 10 | Canvas stays read-only | Write study blocks to Canvas's calendar; GET only | GET only | Nothing the planner does may change the student's course data. § Architecture; § Decision | Blocks go to Google Calendar or an `.ics` file |
