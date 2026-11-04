Derived tables for the priors job.

`ubc_grade_bins.csv` (built by `python -m bsp_priors.ingest_ubcgrades priors/data/pair priors/tables/ubc_grade_bins.csv`):
Grade distribution data: UBC PAIR (source: github.com/DonneyF/ubc-pair-grade-data).
Modified: winter UBCO sections of 10+ students, summed per course, year and grade bin.
Raw PAIR files are downloaded at a pinned commit into `priors/data/` (git-ignored), never committed.

`oulad/` (built by `python -m bsp_priors.ingest_oulad --raw <OULAD dir> --out priors/tables/oulad`): OULAD-derived tables, CC BY 4.0, see `oulad/README.md`. `oulad_study_cuts.json` holds the active-day cut points.

`studentlife/` (built by `python -m bsp_priors.ingest_studentlife --raw <StudentLife dataset dir> --out priors/data/studentlife`, then copy the two aggregate files here): `load_cuts.json` (Load cut points) and `stress_counts.json` (aggregate stress counts per split, no student ids). The row-level CSVs stay in `priors/data/studentlife/` (git-ignored).
