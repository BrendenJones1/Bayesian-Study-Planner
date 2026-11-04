# Data licences and attribution

Checked in November 2026 for issue #90. This is a record of what the sources say, not legal advice.
Only OULAD is confirmed. UBC PAIR and StudentLife are **not**, and the rules at the end follow from that.

| Dataset | Licence | Confirmed? | May derived CSVs be committed to this public repo? |
| --- | --- | --- | --- |
| OULAD | CC BY 4.0 | Yes, on two pages | Yes, with attribution |
| UBC PAIR grade data | None stated | No | Not until confirmed |
| StudentLife | None found | No | Not until confirmed |

## OULAD (Open University Learning Analytics Dataset)

**Licence.** Creative Commons Attribution 4.0 International. Both pages below state it:

- UCI: "This dataset is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) license." It continues: "This allows for the sharing and adaptation of the datasets for any purpose, provided that the appropriate credit is given." (<https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset>)
- Open University: "This dataset is released under CC-BY 4.0 license." (<https://research.stem.open.ac.uk/ouanalyse/open-dataset-more/>)

**Attribution.** The two pages ask for different citations. Use both.

- Open University page: Kuzilek J., Hlosta M., Zdrahal Z. Open University Learning Analytics dataset. Sci. Data 4:170171, doi: 10.1038/sdata.2017.171 (2017).
- UCI page: Kuzilek, J., Hlosta, M., & Zdrahal, Z. (2015). Open University Learning Analytics dataset [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5KK69.

**Not stated on either page:** any restriction on redistribution, derived data, commercial use or re-identification. The pages describe the data as "anonymised" and do not say how.

**Not read in this check:** the CC BY 4.0 legal text, the Scientific Data paper, and the download files. CC BY 4.0 also expects a link to the licence and a note that the data was changed; confirm against the legal text.

**Rule.** The OULAD CSVs from issue #21 may be committed. Put a header or README next to them with the source, the two citations, the licence link, and "modified: aggregated and discretised".

## UBC PAIR grade data (UBCO 2021 to 2025)

**What we use.** The CSVs compiled in <https://github.com/DonneyF/ubc-pair-grade-data>, which come from UBC PAIR's grade distribution dashboards.

**What was found.**

- The repo has no LICENSE file, and GitHub reports no licence for it.
- Its README states no terms, copyright notice or citation request. It describes the data and its quirks only.
- The README says that since 2019 the dashboard hides any section or grade letter with fewer than 6 students, so some cells are empty.
- UBC's own terms for the underlying reports were **not retrieved**. The PAIR site (pair.ubc.ca) has a Terms of Use link in its footer that this check could not read.
- A search result suggested the current dashboards may need a UBC network or VPN. That came from a weak source.

**Status: not confirmed.** A repo with no licence gives no permission to copy it. The facts underneath may come from UBC under its own terms.

**To resolve (needs you):**
1. Read the Terms of Use at pair.ubc.ca and the terms shown on the Grade Distribution Report.
2. If unclear, ask PAIR (find a contact on pair.ubc.ca) whether UBCO section grade distributions may be used in a public student project and republished in aggregate.
3. Record the answer in issue #90.

## StudentLife (Dartmouth, 2013)

**What was found.**

- The dataset's site (studentlife.cs.dartmouth.edu/dataset.html) refused the connection from this environment, and the web archive is blocked in the fetch tool. Its terms were **not read**.
- Searches found no licence statement for the raw data. A Kaggle mirror lists its licence as "Unknown".
- An R package for the dataset is GPL-3. That covers the package code, not the data.
- A different dataset, the College Experience Study, is CC BY-NC-SA 4.0. That is a follow-on study and does not apply here.
- The citation the authors ask for was not read. The design doc lists Wang et al. 2014, StudentLife (UbiComp 2014).

**Status: not confirmed.** The data comes from 48 student participants, so treat the terms carefully.

**To resolve (needs you):**
1. Open the dataset page in a browser and read the terms or agreement. Copy the exact wording and the requested citation here.
2. Check whether use is limited to research or non-commercial work, and whether redistributing derived data is allowed.
3. If the page is silent, ask the dataset's authors. A search result named Andrew Campbell as the contact; confirm that on the site.
4. Record the answer in issue #90.

## Rules until #90 is closed

1. **OULAD-derived CSVs** may be committed, with the attribution above.
2. **PAIR- and StudentLife-derived CSVs** must not be committed. Their builders (#20, #96) download the source at a pinned version and write to a git-ignored folder.
3. **`cpts.json`** (#97, #23) is built from all three datasets and is published on GitHub Pages. Do not publish a version containing PAIR or StudentLife counts until both are confirmed.
4. If a source forbids redistribution of derived data, the fallback in the issue applies: keep a build script that downloads the data, and do not commit the CSVs.

## Attribution to carry into the README (#59) and the report (#58)

- OULAD: both citations above, with the CC BY 4.0 notice.
- UBC PAIR: the wording PAIR's terms require, once confirmed.
- StudentLife: the citation the authors request, once confirmed.
