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
    assert cuts == (6.0, 10.0)  # thirds of the 12 student-day windows
    u00 = now[now.uid == "u00"]
    assert list(u00.stress) == ["Low", "High", "Med"]
    assert list(u00.load) == ["Med", "High", "Med"]  # windows 10, 19, 9


def test_cut_points_written_for_load_node(tmp_path):
    s.write_all(make_raw(tmp_path), tmp_path / "out")
    assert json.loads((tmp_path / "out" / "load_cuts.json").read_text()) == {"low_max": 6.0, "med_max": 10.0}


def test_pairs_with_skipped_day_and_two_answers_in_a_day():
    _, nxt, _, _ = s.build_tables(RESP, DL)
    got = [tuple(r) for r in nxt[["uid", "stress_now", "load_tomorrow", "stress_next"]].itertuples(index=False)]
    assert got == [
        ("u00", "Low", "High", "High"),
        ("u00", "High", "Med", "Med"),  # day 3 skipped
        ("u01", "Low", "High", "Med"),  # day 2 uses the last of two answers; u02 has no pair
    ]


REAL_DEF = [{"name": "Stress", "questions": [
    {"options": "[1]A little stressed, [2]Definitely stressed, [3]Stressed out, [4]Feeling good, [5]Feeling great, ",
     "question_id": "level", "question_text": "Right now, I am..."},
    {"options": "", "question_id": "location", "question_text": ""},
]}]


def test_label_check_reads_the_options_string_of_the_real_definition_file():
    s.check_labels(REAL_DEF)


def test_label_check_rejects_an_options_string_in_a_different_order_or_numbering():
    swapped = "[1]Definitely stressed, [2]A little stressed, [3]Stressed out, [4]Feeling good, [5]Feeling great, "
    renumbered = "[2]A little stressed, [1]Definitely stressed, [3]Stressed out, [4]Feeling good, [5]Feeling great, "
    for options in (swapped, renumbered):
        with pytest.raises(ValueError):
            s.check_labels([{"name": "Stress", "questions": [{"options": options}]}])


def test_a_response_file_with_no_level_key_is_skipped_not_fatal(tmp_path):
    raw = make_raw(tmp_path)  # the downloaded data has one file, u13, whose records only have "null" and resp_time
    (raw / "EMA" / "response" / "Stress" / "Stress_u13.json").write_text(
        json.dumps([{"null": "43.7,-72.3", "resp_time": ts(1)}, {"null": "3", "resp_time": ts(2)}])
    )
    s.write_all(raw, tmp_path / "out")
    now = pd.read_csv(tmp_path / "out" / "studentlife_stress_now.csv")
    assert len(now) == 7 and "u13" not in set(now.uid)


def test_load_counts_deadlines_in_the_next_three_days_including_today():
    wide = pd.DataFrame({"uid": ["u00"], "2013-04-01": [0], "2013-04-02": [0], "2013-04-03": [1],
                         "2013-04-04": [0], "2013-04-05": [0]})
    got = s.next3(wide).sort_values("date")
    assert list(got.deadlines) == [1, 1, 1, 0, 0]  # the last days of the term see fewer days


def test_a_term_that_is_mostly_zero_days_still_gets_two_distinct_cut_points():
    days = [f"2013-04-{d:02d}" for d in range(1, 21)]
    wide = pd.DataFrame({"uid": ["u00"], **{d: [1 if i in (3, 4, 9, 14) else 0] for i, d in enumerate(days)}})
    low, med = s.load_cuts(s.next3(wide).deadlines)
    assert low < med


SPLIT = pd.DataFrame({"uid": ["u00", "u01", "u02"], "split": ["train", "train", "test"]})


def test_stress_counts_per_split_for_both_tables_with_every_cell_present():
    now, nxt, _, _ = s.build_tables(RESP, DL)
    got = s.stress_counts(now, nxt, SPLIT)
    assert got["levels"] == ["Low", "Med", "High"]
    train, test = got["stress_now"]["train"], got["stress_now"]["test"]  # [load][stress]
    assert train["Low"] == {"Low": 1, "Med": 0, "High": 0}
    assert train["Med"] == {"Low": 1, "Med": 1, "High": 0}
    assert train["High"] == {"Low": 0, "Med": 1, "High": 2}
    assert test["High"] == {"Low": 0, "Med": 1, "High": 0} and test["Low"] == {"Low": 0, "Med": 0, "High": 0}
    nx = got["stress_next"]["train"]  # [stress_now][load_tomorrow][stress_next]
    assert nx["Low"]["High"] == {"Low": 0, "Med": 1, "High": 1}
    assert nx["High"]["Med"] == {"Low": 0, "Med": 1, "High": 0}
    assert sum(sum(sum(c.values()) for c in row.values()) for row in got["stress_next"]["test"].values()) == 0


def test_stress_counts_add_up_to_the_rows_of_the_csvs():
    now, nxt, _, _ = s.build_tables(RESP, DL)
    got = s.stress_counts(now, nxt, SPLIT)
    total_now = sum(c for sp in got["stress_now"].values() for row in sp.values() for c in row.values())
    total_next = sum(c for sp in got["stress_next"].values() for a in sp.values() for b in a.values() for c in b.values())
    assert (total_now, total_next) == (len(now), len(nxt))


def test_write_all_writes_the_counts_file_without_any_rows(tmp_path):
    s.write_all(make_raw(tmp_path), tmp_path / "out")
    text = (tmp_path / "out" / "stress_counts.json").read_text()
    got = json.loads(text)
    assert set(got) == {"levels", "stress_now", "stress_next"}
    assert "u00" not in text and "uid" not in text  # aggregates only
