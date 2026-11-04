# Data licences and attribution

Checked in November 2026 for issue #90. This is a record of what the sources say, not legal advice.
OULAD has a stated licence. UBC PAIR and StudentLife each have a usage statement that allows our kind of use
but does not address republishing derived data, so the rules below keep row-level data out of the repo.

| Dataset | What the source says | Use in this project | Derived data |
| --- | --- | --- | --- |
| OULAD | CC BY 4.0 (two pages) | Allowed | CSVs may be committed, with attribution |
| UBC PAIR grade data | Viewing and referencing allowed for general institutional and academic use, subject to UBC data standards and copyright guidelines (quoted by Brenden; guidelines not yet read) | Allowed, subject to the guidelines | Source and per-course-per-year CSVs stay out of the repo; the aggregate grade map in `cpts.json` may be published with attribution once the guidelines are read |
| StudentLife | "publicly available for research and secondary analysis" (quoted by Brenden); silent on redistribution | Allowed | Row-level CSVs stay out of the repo; aggregate tables in `cpts.json` may be published with the authors' citation |

## OULAD (Open University Learning Analytics Dataset)

**Licence.** Creative Commons Attribution 4.0 International. Both pages below state it:

- UCI: "This dataset is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) license." It continues: "This allows for the sharing and adaptation of the datasets for any purpose, provided that the appropriate credit is given." (<https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset>)
- Open University: "This dataset is released under CC-BY 4.0 license." (<https://research.stem.open.ac.uk/ouanalyse/open-dataset-more/>)

**Attribution.** The two pages ask for different citations. Use both.

- Open University page: Kuzilek J., Hlosta M., Zdrahal Z. Open University Learning Analytics dataset. Sci. Data 4:170171, doi: 10.1038/sdata.2017.171 (2017).
- UCI page: Kuzilek, J., Hlosta, M., & Zdrahal, Z. (2015). Open University Learning Analytics dataset [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5KK69.

**Not stated on either page:** any restriction on redistribution, derived data, commercial use or re-identification. The pages describe the data as "anonymised" and do not say how.

**Not read:** the CC BY 4.0 legal text, the Scientific Data paper, and the download files. CC BY 4.0 also expects a link to the licence and a note that the data was changed; confirm against the legal text.

**Rule.** The OULAD CSVs from issue #21 may be committed. Put a header or README next to them with the source, the two citations, the licence link, and "modified: aggregated and discretised".

## UBC PAIR grade data (UBCO 2021 to 2025)

**What we use.** The CSVs compiled in <https://github.com/DonneyF/ubc-pair-grade-data>, which come from UBC PAIR's grade distribution dashboards.

**What the source says.** Quoted by Brenden; the page URL was not supplied, so add it here:

> Publicly available aggregate reports, fact sheets, and institutional dashboards provided on the Planning, Analytics, & Institutional Research Office (PAIR) website are allowed to be viewed and referenced for general institutional and academic use, provided you follow UBC data standards and copyright guidelines

**Reading of it.**

- A course project that uses published aggregate grade distributions to learn probabilities is general academic use, so use is allowed.
- The statement covers "viewed and referenced". It does not say the reports may be copied or republished. The compiled data is also a third party's copy: the repo has no LICENSE file and its README states no terms.
- It is conditional on "UBC data standards and copyright guidelines", which have **not been read**. Until they are, the safe line is: do not republish the source data, publish only the aggregate probabilities.
- The repo's README notes that since 2019 any section or grade letter with fewer than 6 students is hidden, so the data is already suppressed for privacy.

**Rule.**

- The source CSVs and the per-course-per-year-bin file (`ubc_grade_bins.csv`, #20) are not committed. The builder downloads the source at a pinned version into a git-ignored folder.
- The grade map inside `cpts.json` (P(grade >= t | decile, course)) is an aggregate transformation and may be published with the attribution "Grade distribution data: UBC PAIR", after the guidelines are read and found compatible.

**To resolve (needs you):**
1. Add the URL of the statement above.
2. Read the UBC data standards and copyright guidelines it refers to.
3. Confirm that publishing course-level grade-to-decile probabilities with attribution is within them. If it is not, the grade map stays out of the published `cpts.json` and the extension has to compute it locally.

## StudentLife (Dartmouth, 2013)

**What the source says.** Quoted by Brenden; the page URL was not supplied, so add it here:

> The StudentLife dataset from Dartmouth College is publicly available for research and secondary analysis

**Reading of it.**

- A course project that learns stress tables from the survey responses is secondary analysis of a public dataset, so use is allowed.
- The statement is silent on redistribution. The builders' CSVs (#96) hold one row per stress response of an individual participant. That is a subset of the dataset itself, so committing it would be republishing the data.
- The counts in `cpts.json` are aggregates over 48 participants and are not the dataset. Publishing them is analysis output.
- The data comes from 48 student participants, so keep it away from any individual-level publication.
- The authors' requested citation was not read. The design doc cites Wang et al. 2014, StudentLife (UbiComp 2014).

**Rule.**

- The row-level CSVs (`studentlife_stress_now.csv`, `studentlife_stress_next.csv`) are not committed. The builder downloads the source into a git-ignored folder.
- The aggregate tables in `cpts.json` may be published with the authors' citation.

**To resolve (needs you):**
1. Add the URL of the statement above.
2. Copy the citation the dataset page asks for, and any download agreement it requires.
3. Check the page for any limit on sharing aggregate results.

## Rules until #90 is closed

1. **OULAD-derived CSVs** may be committed, with the attribution above.
2. **PAIR and StudentLife source data and row-level CSVs** are never committed. Their builders (#20, #96) download at a pinned version into a git-ignored folder.
3. **`cpts.json`** (#97, #23) may be published with the aggregate tables from all three datasets, with attribution, once the two "To resolve" lists are done.
4. If a source turns out to forbid even aggregate publication, the extension computes that table locally from a build script instead of fetching it.

## Attribution to carry into the README (#59) and the report (#58)

- OULAD: both citations above, with the CC BY 4.0 notice.
- UBC PAIR: "Grade distribution data: UBC PAIR", plus whatever its copyright guidelines require.
- StudentLife: the citation the authors request.
