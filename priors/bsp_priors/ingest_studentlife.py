"""Build the StudentLife stress CSVs (docs/design-v2.md, Stress; Learning the CPTs).

Research basis: StudentLife (Wang et al. 2014, UbiComp) for the stress self-reports and
daily deadline counts; thirds within the sample, the within-class rank idea of equipercentile
linking (Kolen & Brennan, Test Equating, Scaling, and Linking).

Label check (design-v2, "Stress recoding"): the answer labels in EMA_definition.json for the
Stress question are read at build time and must be exactly the five labels in LABELS, in
order, so level n is the n-th label. A mismatch raises and nothing is recoded. LABELS follow
the authors' documentation; they were not checked against the downloaded file when this was
written, so the first real run is that check (test_label_check_* covers the logic).
Recoding: Feeling great / good -> Low, A little stressed -> Med, Definitely stressed /
Stressed out -> High.

Pairs: responses are reduced to the last one per student per local (America/New_York) day.
A pair is two consecutive such days of one student, so a skipped survey day yields one pair
across the gap; "Load tomorrow" is the load on the later response's day.

Row-level CSVs are git-ignored (docs/data-licences.md); only aggregates reach cpts.json.

Run: python -m bsp_priors.ingest_studentlife --raw <StudentLife dataset dir> --out <output dir>
"""

import argparse
import json
from pathlib import Path

import pandas as pd

from bsp_priors.ingest_oulad import LEVELS, split_students

LABELS = ["A little stressed", "Definitely stressed", "Stressed out", "Feeling good", "Feeling great"]
RECODE = dict(zip(LABELS, ["Med", "High", "High", "Low", "Low"]))
TZ = "America/New_York"  # Dartmouth


def check_labels(definition: list) -> None:
    """Raise unless EMA_definition.json lists exactly LABELS as the Stress answer options."""
    entry = next((e for e in definition if e.get("name") == "Stress"), None)
    got = [o for q in (entry or {}).get("questions", []) for o in q.get("matrix_options", [])]
    if got != LABELS:
        raise ValueError(f"Stress labels in EMA_definition.json are {got}, expected {LABELS}")


def load_cuts(deadlines: pd.Series) -> tuple[float, float]:
    """Thirds of deadlines per student-day: Low if n <= c1, Med if n <= c2, else High."""
    q = deadlines.quantile([1 / 3, 2 / 3], interpolation="lower")
    return float(q.iloc[0]), float(q.iloc[1])


def to_load(n: pd.Series, cuts: tuple[float, float]) -> pd.Series:
    return pd.cut(n, [-1, cuts[0], cuts[1], float("inf")], labels=LEVELS).astype(str)


def build_tables(responses: pd.DataFrame, deadlines: pd.DataFrame):
    """responses: uid, level (1..5), resp_time (epoch s). deadlines: wide, uid then one column per date.
    Return (stress_now, stress_next, cuts, split)."""
    long = deadlines.melt(id_vars="uid", var_name="date", value_name="deadlines").dropna()
    cuts = load_cuts(long.deadlines)
    long["load"] = to_load(long.deadlines, cuts)
    r = responses.dropna(subset=["level"]).copy()
    r["stress"] = r.level.astype(int).map(lambda i: RECODE[LABELS[i - 1]])
    r["date"] = pd.to_datetime(r.resp_time, unit="s", utc=True).dt.tz_convert(TZ).dt.strftime("%Y-%m-%d")
    r = r.sort_values(["uid", "resp_time"])
    now = r.merge(long[["uid", "date", "load"]], on=["uid", "date"])[["uid", "date", "load", "stress"]]
    day = now.groupby(["uid", "date"], as_index=False).last()  # last response of the day
    day["stress_now"] = day.groupby("uid").stress.shift()
    nxt = day.dropna(subset=["stress_now"]).rename(columns={"stress": "stress_next", "load": "load_tomorrow"})
    nxt = nxt[["uid", "date", "stress_now", "load_tomorrow", "stress_next"]]
    return now, nxt, cuts, split_students(r.uid).rename(columns={"id_student": "uid"})


def write_all(raw: Path, out: Path) -> tuple[float, float]:
    check_labels(json.loads((raw / "EMA" / "EMA_definition.json").read_text()))
    rows = []
    for f in sorted((raw / "EMA" / "response" / "Stress").glob("Stress_u*.json")):
        d = pd.DataFrame(json.loads(f.read_text()))
        d["uid"] = f.stem.removeprefix("Stress_")
        rows.append(d[["uid", "level", "resp_time"]])
    now, nxt, cuts, split = build_tables(
        pd.concat(rows, ignore_index=True), pd.read_csv(raw / "education" / "deadlines.csv")
    )
    out.mkdir(parents=True, exist_ok=True)
    now.to_csv(out / "studentlife_stress_now.csv", index=False)
    nxt.to_csv(out / "studentlife_stress_next.csv", index=False)
    split.to_csv(out / "studentlife_split.csv", index=False)
    (out / "load_cuts.json").write_text(json.dumps({"low_max": cuts[0], "med_max": cuts[1]}))
    return cuts


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("priors/data"))
    args = ap.parse_args()
    print("Load cut points (low_max, med_max):", write_all(args.raw, args.out))
