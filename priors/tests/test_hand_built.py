import pytest
from bsp_priors import fit


@pytest.fixture(scope="module")
def hb():
    return fit.build(built_at="x")["hand_built"]


def _state(t, key):
    row = t["values"]["|".join(key)]
    assert sorted(row) == [0.0, 0.0, 1.0]
    return t["states"][row.index(1.0)]


def test_criterion_1_difficulty_and_perf_are_rounded_means(hb):
    assert len(hb["exam_difficulty"]["values"]) == len(hb["perf"]["values"]) == 27
    assert _state(hb["perf"], ["Low", "Low", "Med"]) == "Low"  # 0.33
    assert _state(hb["perf"], ["Low", "Med", "High"]) == "Med"  # 1.0
    assert _state(hb["perf"], ["High", "High", "Med"]) == "High"  # 1.67
    assert _state(hb["exam_difficulty"], ["Med", "Hard", "Hard"]) == "Hard"  # 1.67
    assert _state(hb["exam_difficulty"], ["Easy", "Hard", "Hard"]) == "Med"  # 1.33
    assert _state(hb["exam_difficulty"], ["Easy", "Easy", "Med"]) == "Easy"  # 0.33


def test_criterion_2_study_before_has_27_rows(hb):
    t = hb["study_before"]
    assert len(t["values"]) == 27
    assert list(t["parents"]) == ["study", "action", "days_left"]


def test_criterion_3_every_table_has_an_explanation(hb):
    assert all(len(t["explanation"]) > 40 for t in hb.values())


def test_criterion_4_five_rows_recomputed_by_hand(hb):
    t = hb["study_before"]
    # Hand arithmetic, window 28 (27 other days). Volume cuts 2/4 h/week; active-day cuts 5.4/12.15.
    # Low (1 h, 0.1), Rest: 3.86 h -> 0.96/week -> 0; 2.7 days -> 0; sum 0 -> Low
    assert _state(t, ["Low", "Rest", "8+"]) == "Low"
    # Low, Intense: 8.86 h -> 2.21/week -> 1; 2.7 + 1 = 3.7 days -> 0; sum 1 -> Low
    assert _state(t, ["Low", "Intense", "1-2"]) == "Low"
    # Med (3 h, 0.3), Light: 11.57 + 1 = 12.57 h -> 3.14/week -> 1; 8.1 + 1 = 9.1 days -> 1; sum 2 -> Med
    assert _state(t, ["Med", "Light", "3-7"]) == "Med"
    # Med, Intense: 16.57 h -> 4.14/week -> 2; 9.1 days -> 1; sum 3 -> High
    assert _state(t, ["Med", "Intense", "8+"]) == "High"
    # High (5 h, 0.6), Rest: 19.29 h -> 4.82/week -> 2; 16.2 days -> 2; sum 4 -> High
    assert _state(t, ["High", "Rest", "3-7"]) == "High"


def test_level_only_table_and_days_left_has_no_effect(hb):
    t = hb["study_before"]
    want = {"Low": ("Low", "Low", "Low"), "Med": ("Med", "Med", "High"), "High": ("High", "High", "High")}
    for study, (rest, light, intense) in want.items():
        for days in ("1-2", "3-7", "8+"):
            assert [_state(t, [study, a, days]) for a in ("Rest", "Light", "Intense")] == [rest, light, intense]
