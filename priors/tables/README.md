Derived tables for the priors job.

`ubc_grade_bins.csv` (built by `python -m bsp_priors.ingest_ubcgrades priors/data/pair priors/tables/ubc_grade_bins.csv`):
Grade distribution data: UBC PAIR (source: github.com/DonneyF/ubc-pair-grade-data).
Modified: winter UBCO sections of 10+ students, summed per course, year and grade bin.
Raw PAIR files are downloaded at a pinned commit into `priors/data/` (git-ignored), never committed.
