import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import pytest
from bsp_priors import ingest_studentlife as s

DEF = [{"name": "Stress", "questions": [{"matrix_options": s.LABELS}]}]


def ts(day):  # noon local time
    return datetime(2013, 4, day, 12, tzinfo=ZoneInfo(s.TZ)).timestamp()


# u00 answers days 1, 2, 4 (skips 3); u01 answers 1 and 2 (twice on day 2); u02 answers day 1 only.
RESP = pd.DataFrame(
    [("u00", 5, ts(1)), ("u00", 3, ts(2)), ("u00", 1, ts(4)),
     ("u01", 4, ts(1)), ("u01", 2, ts(2)), ("u01", 1, ts(2) + 60),
     ("u02", 1, ts(1))],
    columns=["uid", "level", "resp_time"],
)
DL = pd.DataFrame(
    {"uid": ["u00", "u01", "u02"], "2013-04-01": [0, 0, 6], "2013-04-02": [1, 3, 6],
     "2013-04-03": [9, 0, 0], "2013-04-04": [9, 9, 0]}
)


def make_raw(tmp_path):
    raw = tmp_path / "raw"
    (raw / "EMA" / "response" / "Stress").mkdir(parents=True)
    (raw / "education").mkdir()
    (raw / "EMA" / "EMA_definition.json").write_text(json.dumps(DEF))
    for u, g in RESP.groupby("uid"):
        (raw / "EMA" / "response" / "Stress" / f"Stress_{u}.json").write_text(
            g[["level", "resp_time"]].to_json(orient="records")
        )
    DL.to_csv(raw / "education" / "deadlines.csv", index=False)
    return raw


def test_label_check_passes_on_expected_labels_and_raises_otherwise():
    s.check_labels(DEF)
    with pytest.raises(ValueError):
        s.check_labels([{"name": "Stress", "questions": [{"matrix_options": s.LABELS[::-1]}]}])


def test_writes_both_csvs(tmp_path):
    s.write_all(make_raw(tmp_path), tmp_path / "out")
    assert len(pd.read_csv(tmp_path / "out" / "studentlife_stress_now.csv")) == 7
    assert len(pd.read_csv(tmp_path / "out" / "studentlife_stress_next.csv")) == 3


def test_recodes_stress_and_deadline_thirds():
    now, _, cuts, _ = s.build_tables(RESP, DL)
    assert cuts == (0.0, 6.0)  # thirds of the 12 student-days
    u00 = now[now.uid == "u00"]
    assert list(u00.stress) == ["Low", "High", "Med"]
    assert list(u00.load) == ["Low", "Med", "High"]


def test_cut_points_written_for_load_node(tmp_path):
    s.write_all(make_raw(tmp_path), tmp_path / "out")
    assert json.loads((tmp_path / "out" / "load_cuts.json").read_text()) == {"low_max": 0.0, "med_max": 6.0}


def test_pairs_with_skipped_day_and_two_answers_in_a_day():
    _, nxt, _, _ = s.build_tables(RESP, DL)
    got = [tuple(r) for r in nxt[["uid", "stress_now", "load_tomorrow", "stress_next"]].itertuples(index=False)]
    assert got == [
        ("u00", "Low", "Med", "High"),
        ("u00", "High", "High", "Med"),  # day 3 skipped
        ("u01", "Low", "Med", "Med"),  # day 2 uses the last of two answers; u02 has no pair
    ]
