"""Build the StudentLife stress CSVs (docs/design-v2.md, Stress; Learning the CPTs).

Research basis: StudentLife (Wang et al. 2014, UbiComp) for the stress self-reports and
deadlines in the next 3 days (as the extension counts them); thirds within the sample, the within-class rank idea of equipercentile
linking (Kolen & Brennan, Test Equating, Scaling, and Linking).

Label check (design-v2, "Stress recoding"): the answer labels in EMA_definition.json for the
Stress question are read at build time and must be exactly the five labels in LABELS, in
order, so level n is the n-th label. A mismatch raises and nothing is recoded. Checked against
the Kaggle copy dartweichen/student-life: its definition stores the options as one string,
"[1]A little stressed, [2]Definitely stressed, ...", which check_labels parses (test_label_check_*).
A response file with no "level" key (u13 in that copy) is skipped.
Recoding: Feeling great / good -> Low, A little stressed -> Med, Definitely stressed /
Stressed out -> High.

Pairs: responses are reduced to the last one per student per local (America/New_York) day.
A pair is two consecutive such days of one student, so a skipped survey day yields one pair
across the gap; "Load tomorrow" is the load on the later response's day.

Row-level CSVs are git-ignored (docs/data-licences.md). stress_counts.json holds only aggregate counts per
split (no student ids) and is committed, so cpts.json can be rebuilt without the raw data.

Run: python -m bsp_priors.ingest_studentlife --raw <StudentLife dataset dir> --out <output dir>
"""

import argparse
import json
import re
from pathlib import Path

import pandas as pd

from bsp_priors.ingest_oulad import LEVELS, split_students

LABELS = ["A little stressed", "Definitely stressed", "Stressed out", "Feeling good", "Feeling great"]
RECODE = dict(zip(LABELS, ["Med", "High", "High", "Low", "Low"]))
TZ = "America/New_York"  # Dartmouth


def check_labels(definition: list) -> None:
    """Raise unless EMA_definition.json lists exactly LABELS as the Stress answer options."""
    entry = next((e for e in definition if e.get("name") == "Stress"), None)
    got: list[str] = []
    for q in (entry or {}).get("questions", []):
        got += q.get("matrix_options", [])
        # The downloaded file stores one string: "[1]A little stressed, [2]Definitely stressed, ..."
        numbered = re.findall(r"\[(\d+)\]\s*([^,\[]+)", q.get("options") or "")
        if [int(n) for n, _ in numbered] != list(range(1, len(numbered) + 1)):
            raise ValueError(f"Stress options are not numbered 1..n in order: {q['options']!r}")
        got += [label.strip() for _, label in numbered]
    if got != LABELS:
        raise ValueError(f"Stress labels in EMA_definition.json are {got}, expected {LABELS}")


def next3(deadlines: pd.DataFrame) -> pd.DataFrame:
    """Deadlines in the next 3 days (today and the two after) per student-day: uid, date, deadlines.

    This is the variable the extension reads from Canvas (design-v2, Network: Load). Counting single
    days instead gives thirds of (0, 0), because 79% of student-days have no deadline. The last days of
    the term see fewer days.
    """
    wide = deadlines.set_index("uid")
    wide = wide[sorted(wide.columns)]  # ISO dates sort chronologically
    ahead = wide.T.iloc[::-1].rolling(3, min_periods=1).sum().iloc[::-1].T
    return ahead.reset_index().melt(id_vars="uid", var_name="date", value_name="deadlines").dropna()


def load_cuts(deadlines: pd.Series) -> tuple[float, float]:
    """Thirds of next-3-day deadline counts per student-day: Low if n <= c1, Med if n <= c2, else High."""
    q = deadlines.quantile([1 / 3, 2 / 3], interpolation="lower")
    return float(q.iloc[0]), float(q.iloc[1])


def to_load(n: pd.Series, cuts: tuple[float, float]) -> pd.Series:
    return pd.cut(n, [-1, cuts[0], cuts[1], float("inf")], labels=LEVELS).astype(str)


def stress_counts(now: pd.DataFrame, nxt: pd.DataFrame, split: pd.DataFrame) -> dict:
    """Aggregate counts per split (train, test) with every cell present: no student ids, safe to commit.

    stress_now[split][load][stress]; stress_next[split][stress_now][load_tomorrow][stress_next].
    """
    part = split.set_index("uid").split
    out: dict = {"levels": LEVELS, "stress_now": {}, "stress_next": {}}
    for sp in ("train", "test"):
        n, x = now[now.uid.map(part) == sp], nxt[nxt.uid.map(part) == sp]
        out["stress_now"][sp] = {
            load: {st: int(((n.load == load) & (n.stress == st)).sum()) for st in LEVELS} for load in LEVELS
        }
        out["stress_next"][sp] = {
            a: {
                load: {b: int(((x.stress_now == a) & (x.load_tomorrow == load) & (x.stress_next == b)).sum())
                      for b in LEVELS}
                for load in LEVELS
            }
            for a in LEVELS
        }
    return out


def build_tables(responses: pd.DataFrame, deadlines: pd.DataFrame):
    """responses: uid, level (1..5), resp_time (epoch s). deadlines: wide, uid then one column per date.
    Return (stress_now, stress_next, cuts, split)."""
    long = next3(deadlines)
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
        # A file with no "level" key (u13 in the downloaded data) yields NaN levels, dropped later.
        rows.append(d.reindex(columns=["uid", "level", "resp_time"]))
    now, nxt, cuts, split = build_tables(
        pd.concat(rows, ignore_index=True), pd.read_csv(raw / "education" / "deadlines.csv")
    )
    out.mkdir(parents=True, exist_ok=True)
    now.to_csv(out / "studentlife_stress_now.csv", index=False)
    nxt.to_csv(out / "studentlife_stress_next.csv", index=False)
    split.to_csv(out / "studentlife_split.csv", index=False)
    (out / "stress_counts.json").write_text(json.dumps(stress_counts(now, nxt, split), indent=1))
    (out / "load_cuts.json").write_text(json.dumps({"low_max": cuts[0], "med_max": cuts[1]}))
    return cuts


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("priors/data"))
    args = ap.parse_args()
    print("Load cut points (low_max, med_max):", write_all(args.raw, args.out))
