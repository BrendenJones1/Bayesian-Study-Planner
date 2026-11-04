# Data licences and attribution

Checked in November 2026 for issue #90. This is a record of what the sources say, not legal advice.
Only OULAD may be redistributed. **UBC PAIR data may not be used beyond short personal extracts, or republished in
any form, without UBC's prior written consent.** StudentLife is described as publicly available for research.

| Dataset | What the source says | Status | Derived data |
| --- | --- | --- | --- |
| OULAD | CC BY 4.0 (two pages) | Confirmed | CSVs may be committed, with attribution |
| UBC PAIR grade data | Limited licence for personal, non-commercial display or print of short, unmodified extracts; nothing may be "reproduced, republished or re-disseminated" without UBC's prior written consent | **Blocked until UBC consents** | Nothing derived from it may be committed or published, including the aggregate grade map |
| StudentLife | "publicly available" (a paper at studentlife.cs.dartmouth.edu) and "publicly available for research and secondary analysis" (quoted by Brenden); silent on redistribution | Use allowed; terms not read by us | Row-level CSVs stay out of the repo; aggregate tables in `cpts.json` may be published with the authors' citation |

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

**What the terms say.** Quoted by Brenden from UBC's Terms of Use, and matched against <https://www.ubc.ca/site/legal.html> (the same wording appears there; that page was read through a summarising tool, so check the exact text before citing it formally):

> you are granted a limited license to use (display or print) short extracts of the information ... for your own personal, non-commercial use only, provided the information is not modified. Any other use of the information is prohibited.

> None of the information may be otherwise reproduced, republished or re-disseminated in any manner or form ... without the prior written consent of the University of British Columbia.

To obtain consent the page says to "contact the faculty, department, or administrative unit responsible ... for the information in which you are interested". It names no email or form. It says nothing about research, academic use or text and data mining.

A second statement Brenden supplied, from the PAIR site (URL not given), allows aggregate reports and dashboards to "be viewed and referenced for general institutional and academic use, provided you follow UBC data standards and copyright guidelines". The Terms of Use above are the copyright rules it points to, so the stricter wording governs.

**Reading of it.**

- Viewing and referencing a dashboard is allowed. Downloading whole datasets, aggregating them into a grade map and shipping that map inside an extension is not "short extracts", is "modified", and is "re-disseminated". It needs UBC's written consent.
- This applies to the aggregate grade map too: course-level probabilities such as P(grade >= t | decile, course) are information taken from the PAIR reports.
- The compiled GitHub repo has no licence file, so it gives no further permission.
- The README of that repo notes that sections and grade letters with fewer than 6 students are already hidden by UBC.

**Rule.** Until UBC consents in writing:

- No PAIR source files and nothing derived from them are committed or published. That covers `ubc_grade_bins.csv` (#20) and the grade map inside `cpts.json`.
- The pipeline must not depend on PAIR data being available.

**Already in the repo.** `docs/design-v2.md` (and the issues that quote it) contains a few figures derived from PAIR data: the 75.3 and 81.0 difficulty cut points, "P(>= 80 | decile 7) = 0.70" for MATH 100, and "72% against 35%". They are small, but they are published. Decide whether to keep them, ask UBC about them in the same request, or replace them with placeholders.

**Options (a decision for you; none is applied):**

1. **Ask UBC for written consent.** Contact the unit responsible for the data (PAIR, UBCO). Say it is a course project, name the exact use (build a course-level grade map, publish it as aggregate probabilities in an open-source extension), and ask for written permission. Your instructor may be able to help. The turnaround is unknown, so do not wait on it.
2. **Replace the PAIR grade map with something not taken from UBC.** For example, derive the standing-to-grade mapping from the Canvas class statistics a student already sees, or use a hand-built mapping stated as an assumption, with a sensitivity check like the other assumed numbers. This changes the design: the Grade node, difficulty groups and the grade-map stability test all use PAIR today.
3. **Do both:** request consent, and build the pipeline on option 2 so nothing blocks. If consent arrives, the PAIR map can be added back.

Option 3 is the safest use of the time.

**To resolve (needs you):**
1. Choose between the options above.
2. If asking UBC, send the request and record the date and reply in #90.
3. Check the exact wording on the live page, since this record is built from a summary.

## StudentLife (Dartmouth, 2013)

**What the source says.** Two statements, both supplied by Brenden. The second is a paper at <https://studentlife.cs.dartmouth.edu/studentlife.pdf>, which says the dataset is "publicly available". That host refused connections from the research environment, so neither statement was read by us. The URL of the first was not supplied.

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
1. Add the URL of the "research and secondary analysis" statement.
2. From the PDF or the dataset page, copy the citation the authors ask for, and any download agreement.
3. Check for any limit on sharing aggregate results.

## Rules until #90 is closed

1. **OULAD-derived CSVs** may be committed, with the attribution above.
2. **UBC PAIR:** nothing from it, or derived from it, is committed or published. #20, the grade-map half of #97 and #23, and the grade-map stability evaluation (#49) wait for UBC's consent or for a replacement.
3. **StudentLife source data and row-level CSVs** are never committed. The builder (#96) downloads the source into a git-ignored folder.
4. **`cpts.json`** may be published with the OULAD and StudentLife aggregate tables, with attribution, and without anything derived from PAIR.
5. If a source turns out to forbid even aggregate publication, the extension computes that table locally from a build script instead of fetching it.

## Attribution to carry into the README (#59) and the report (#58)

- OULAD: both citations above, with the CC BY 4.0 notice.
- UBC PAIR: only if UBC consents, and in the wording the consent requires.
- StudentLife: the citation the authors request.
