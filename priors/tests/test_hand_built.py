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
    # Hand arithmetic. Cuts: volume 2/4 h, active share 0.199/0.410.
    # Low pace (1 h, 0.1), Rest, 8+ (10 d): 1*10/11 = 0.91 h -> 0; 0.1*10/11 = 0.09 -> 0; sum 0 -> Low
    assert _state(t, ["Low", "Rest", "8+"]) == "Low"
    # Med pace (3 h, 0.3), Rest, 8+: 3*10/11 = 2.73 h -> 1; 0.3*10/11 = 0.27 -> 1; sum 2 -> Med
    assert _state(t, ["Med", "Rest", "8+"]) == "Med"
    # Low pace, Intense, 1-2 (2 d): (2/7 + 5)/3*7 = 12.3 h -> 2; (0.2 + 1)/3 = 0.40 -> 1; sum 3 -> High
    assert _state(t, ["Low", "Intense", "1-2"]) == "High"
    # High pace (5 h, 0.6), Light, 3-7 (5 d): (25/7 + 1)/6*7 = 5.33 h -> 2; (3 + 1)/6 = 0.67 -> 2; sum 4 -> High
    assert _state(t, ["High", "Light", "3-7"]) == "High"
    # Low pace, Light, 8+: (10/7 + 1)/11*7 = 1.55 h -> 0; (1 + 1)/11 = 0.18 -> 0; sum 0 -> Low
    assert _state(t, ["Low", "Light", "8+"]) == "Low"
