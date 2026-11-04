"""UBCO grade map: PAIR section CSVs -> ubc_grade_bins.csv, and P(grade >= t | decile, course).

Research basis: equipercentile linking (Kolen & Brennan, Test Equating, Scaling, and Linking).
Class standing (a decile) is matched across datasets by percentile, never by raw score.
Design: docs/design-v2.md (Prediction, grade map). Data rules: docs/data-licences.md.

Grade distribution data: UBC PAIR (source: github.com/DonneyF/ubc-pair-grade-data)
"""

import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

# Raw PAIR files are downloaded at this commit into a git-ignored folder, never committed.
PAIR_REPO = "DonneyF/ubc-pair-grade-data"
PAIR_COMMIT = "18af317b9ded65047f8438b854317b4ff7fcb88d"
PAIR_DIR = "tableau-dashboard-v2/UBCO"
YEARS = range(2021, 2026)
MIN_STUDENTS = 10  # sections smaller than this are excluded

# The swappable grade map: PAIR bin name -> lower edge. Targets are these edges (design: Targets).
BINS = {"<50": 0, "50-54": 50, "55-59": 55, "60-63": 60, "64-67": 64, "68-71": 68,
        "72-75": 72, "76-79": 76, "80-84": 80, "85-89": 85, "90-100": 90}
HARD_BELOW, EASY_FROM = 75.3, 81.0  # course average cut points for the difficulty groups
FIELDS = ["course", "year", "bin", "students", "avg"]


def parse_course_code(text: str) -> tuple[str, str] | None:
    """Canvas course code -> (PAIR subject, course number), or None.

    Handles the UBCO campus suffix ("MATH_O 100"), and trailing section or lab
    markers ("-001", " 001", " L01", "100A"). Examples: "MATH_O 100-001 2024W" -> ("MATH", "100").
    """
    m = re.match(r"\s*([A-Za-z]{2,4})(?:_[OV])?[\s-]*(\d{3})(?!\d)", text)
    return (m[1].upper(), m[2]) if m else None


def build_rows(pair_dir: Path) -> list[dict]:
    """One row per course, year and bin, from winter UBCO section CSVs under pair_dir."""
    counts: dict = defaultdict(lambda: defaultdict(int))
    avg_sum: dict = defaultdict(float)
    for path in sorted(pair_dir.rglob("*.csv")):
        with path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["Session"] != "W" or not r["Reported"] or int(r["Reported"]) < MIN_STUDENTS:
                    continue
                if not r["Avg"] or any(r[b] == "" for b in BINS):  # privacy-hidden cells: skip section
                    continue
                key = (f"{r['Subject']} {r['Course']}", int(r["Year"]))
                for b in BINS:
                    counts[key][b] += int(r[b])
                avg_sum[key] += float(r["Avg"]) * int(r["Reported"])
    rows = []
    for key in sorted(counts):
        n = sum(counts[key].values())
        for b in BINS:
            rows.append({"course": key[0], "year": key[1], "bin": b,
                         "students": counts[key][b], "avg": f"{avg_sum[key] / n:.2f}"})
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return [{**r, "year": int(r["year"]), "students": int(r["students"]), "avg": float(r["avg"])}
                for r in csv.DictReader(f)]


def difficulty(avg: float) -> str:
    return "Hard" if avg < HARD_BELOW else "Easy" if avg >= EASY_FROM else "Medium"


def _p_in_decile(counts: dict[str, int], target: int, decile: int) -> float:
    """P(grade >= target | decile) for one distribution; decile 10 is the top tenth.

    Students are ordered by bin and a bin's students are spread evenly across its rank range.
    """
    n = sum(counts.values())
    lo_d, hi_d = (decile - 1) * n / 10, decile * n / 10
    above, cum = 0.0, 0
    for b, lo_edge in BINS.items():
        overlap = max(0.0, min(hi_d, cum + counts[b]) - max(lo_d, cum))
        if lo_edge >= target:
            above += overlap
        cum += counts[b]
    return above / (n / 10)


def grade_map(rows: list[dict], course: str, target: int, decile: int) -> float:
    """P(grade >= target | decile, course): each year sliced separately, then averaged.

    A course with under 2 years of data uses the pooled distribution of its difficulty group.
    """
    by_year: dict = defaultdict(lambda: defaultdict(int))
    avgs: dict = {}
    for r in rows:
        avgs[(r["course"], r["year"])] = r["avg"]
        if r["course"] == course:
            by_year[r["year"]][r["bin"]] += r["students"]
    if len(by_year) >= 2:
        return sum(_p_in_decile(c, target, decile) for c in by_year.values()) / len(by_year)
    if not by_year:
        raise KeyError(course)
    group = difficulty(avgs[(course, next(iter(by_year)))])
    pooled: dict = defaultdict(int)
    for r in rows:
        if difficulty(avgs[(r["course"], r["year"])]) == group:
            pooled[r["bin"]] += r["students"]
    return _p_in_decile(pooled, target, decile)


def download(dest: Path) -> None:
    """Fetch winter UBCO CSVs for YEARS at PAIR_COMMIT into dest (a git-ignored folder)."""
    api = f"https://api.github.com/repos/{PAIR_REPO}/contents/{PAIR_DIR}"
    for y in YEARS:
        with urllib.request.urlopen(f"{api}/{y}W?ref={PAIR_COMMIT}") as resp:
            files = json.load(resp)
        for f in files:
            raw = f"https://raw.githubusercontent.com/{PAIR_REPO}/{PAIR_COMMIT}/{PAIR_DIR}/{y}W/{f['name']}"
            dest.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(raw, dest / f["name"])


if __name__ == "__main__":  # python -m bsp_priors.ingest_ubcgrades <raw_dir> <out.csv>
    raw, out = Path(sys.argv[1]), Path(sys.argv[2])
    if not raw.exists():
        download(raw)
    write_csv(build_rows(raw), out)
