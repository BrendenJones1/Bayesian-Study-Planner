# Bayesian Study Planner

A local-first Chrome extension for UBC Canvas. Each night it picks a study action for every course with an upcoming exam (intense 5 h, light 1 h, or rest) by comparing expected utility: the chance of reaching a grade target, minus a stress cost. A discrete Bayesian network computes both, using tables learned by counting from public datasets, plus the student's own Canvas data. Full design and the reasons behind each choice: [`docs/design-v2.md`](docs/design-v2.md).

## Install

Needs Node 20+ and Python 3.12.

```bash
git clone https://github.com/BrendenJones1/Bayesian-Study-Planner.git
cd Bayesian-Study-Planner
cd extension && npm ci && npm run build
```

Then open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/dist`.

Run the full checks (the same ones CI runs) from the repo root with `scripts/ci-local.sh`.

## Privacy model

No student data leaves the browser, with one exception: the student's own Google Calendar, and only after they click Connect.

- Canvas is read-only: the extension only sends GET requests to `canvas.ubc.ca/api/v1/...`.
- It GETs the published `cpts.json` (population tables, no student data).
- Google Calendar exception: free/busy queries (scope `calendar.freebusy`), and create, update or delete of the study blocks the planner itself wrote (scope `calendar.events`). Event titles and details are never read. Study-block titles carry only a course code and hours, never grades, probabilities or stress.
- No other host is contacted.

## Architecture

Learning happens once, offline, in Python. Inference happens daily, in the browser, on the student's own data.

1. **Build CSVs** (Python, pandas): discretize OULAD, UBC Grades and StudentLife into one CSV per learned table.
2. **Learn CPTs**: Laplace-smoothed counts, written to `cpts.json`.
3. **Graded notebook** (pgmpy): builds the network from `cpts.json` and runs `VariableElimination` for every query, the personas and the evaluation.
4. **Publish**: `cpts.json` goes to GitHub Pages.
5. **Extension** (TypeScript): reads Canvas (GET only), the timer and `cpts.json`, and runs the same queries by exact enumeration, checked against pgmpy by golden vectors in `shared/fixtures/`.
6. **Nightly, on the device**: `chrome.alarms` re-counts the personal offset when a new grade appears, reads tomorrow's available hours (Google Calendar free/busy, or the manual setting), re-runs both models, and writes the chosen study blocks to the calendar.

Layout: `extension/` (Chrome MV3, Vite, React), `priors/` (package `bsp_priors`), `eval/` (pgmpy notebooks), `shared/fixtures/` (parity vectors).

## Rebuild the CSVs and `cpts.json`

```bash
pip install -e priors -e eval
```

Build each CSV (raw sources are downloaded separately and not committed; see [`priors/tables/README.md`](priors/tables/README.md)):

```bash
python -m bsp_priors.ingest_ubcgrades priors/data/pair priors/tables/ubc_grade_bins.csv
python -m bsp_priors.ingest_oulad --raw <OULAD dir> --out priors/tables/oulad
python -m bsp_priors.ingest_studentlife --raw <StudentLife dataset dir> --out priors/data/studentlife
```

Then learn the CPTs and write `cpts.json`:

```bash
python -m bsp_priors.publish --out site/cpts.json
```

## Data attribution

- OULAD (CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>; modified: aggregated and discretised): Kuzilek J., Hlosta M., Zdrahal Z. Open University Learning Analytics dataset. Sci. Data 4:170171, doi: 10.1038/sdata.2017.171 (2017). Also: Kuzilek, J., Hlosta, M., & Zdrahal, Z. (2015). Open University Learning Analytics dataset [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5KK69.
- Grade distribution data: UBC PAIR.
- StudentLife: Wang et al. 2014, StudentLife (UbiComp 2014).

See [`docs/data-licences.md`](docs/data-licences.md) for the licence status of each source.
