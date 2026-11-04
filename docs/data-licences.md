# Data licences and attribution

Checked in November 2026 for issue #90. This is a record of what the sources say, not legal advice.
OULAD is CC BY 4.0. **UBC's Terms of Use bar reproducing or republishing PAIR data without UBC's prior written
consent. The project owner has decided to use UBC grade data in this class project anyway** (decision recorded below;
written consent is not yet on file). StudentLife is described as publicly available for research.

| Dataset | What the source says | Status | Derived data |
| --- | --- | --- | --- |
| OULAD | CC BY 4.0 (two pages) | Confirmed | CSVs may be committed, with attribution |
| UBC PAIR grade data | Limited licence for personal, non-commercial display or print of short, unmodified extracts; nothing may be "reproduced, republished or re-disseminated" without UBC's prior written consent | **Used by owner decision; written consent not on file** | Derived CSV and the grade map in `cpts.json` may be committed and published, with attribution; the raw source files are not committed |
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

**Decision (project owner, November 2026).** UBC grade data stays part of the project. The reasons given: the UBC Grades data comes from PAIR; the course professor is the learning analytics researcher at the school and is expected to have no objection to use in a class project. This is the owner's call. It is not the written consent the terms ask for, and the terms still say what they say. The risk that remains is a request from UBC to take the derived data down.

**Rule.**

- The pipeline uses PAIR data: #20, the grade map in #97 and #23, and #49 go ahead.
- Derived files (`ubc_grade_bins.csv`, the grade map in `cpts.json`) may be committed and published, with the attribution "Grade distribution data: UBC PAIR (source: github.com/DonneyF/ubc-pair-grade-data)".
- The raw PAIR source files are not committed. The builder downloads them at a pinned version. The pipeline does not need them in the repo, and it keeps the amount of republished data to the minimum the project uses.
- If UBC objects, the derived PAIR files are removed and the grade map is replaced (for example with a hand-built mapping stated as an assumption), so the builder should keep the grade map in one table that can be swapped out.

**Already in the repo.** `docs/design-v2.md` quotes a few figures derived from PAIR data (the 75.3 and 81.0 cut points, MATH 100's 0.70, "72% against 35%"). They stay.

**Open items (optional, cheap):**
1. Ask the course professor for a one-line email saying the class project may use the UBC grade distribution data. Save it, or record its date and wording in #90. That turns the decision into written consent from someone at the university, though not necessarily from the unit that owns the data.
2. Check the exact wording of the Terms of Use on the live page, since this record was built from a summary.

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

## Rules

1. **OULAD-derived CSVs** may be committed, with the attribution above.
2. **UBC PAIR:** derived files may be committed and published with attribution, by owner decision. Raw source files are not committed. The grade map lives in one swappable table.
3. **StudentLife source data and row-level CSVs** are never committed. The builder (#96) downloads the source into a git-ignored folder. Aggregate tables in `cpts.json` may be published with the authors' citation.
4. If a source objects to publication of derived data, the affected table is removed and replaced, or the extension computes it locally from a build script.

## Attribution to carry into the README (#59) and the report (#58)

- OULAD: both citations above, with the CC BY 4.0 notice.
- UBC PAIR: "Grade distribution data: UBC PAIR", plus any wording a consent email asks for.
- StudentLife: the citation the authors request.
