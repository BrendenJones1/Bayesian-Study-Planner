import re
from pathlib import Path

REPO = Path(__file__).parents[2]
README = (REPO / "README.md").read_text()


def section(title):
    return re.search(rf"^## {title}\n(.*?)(?=^## |\Z)", README, re.MULTILINE | re.DOTALL).group(1)


def test_criterion_1_install_steps_match_the_real_commands():
    s = section("Install")
    assert "npm ci" in s and "npm run build" in s and "Load unpacked" in s
    assert (REPO / "extension/package-lock.json").exists()
    assert "scripts/ci-local.sh" in s and (REPO / "scripts/ci-local.sh").exists()


def test_criterion_2_privacy_states_calendar_exception_and_title_content():
    s = section("Privacy model")
    assert "Google Calendar exception" in s
    assert "course code and hours" in s


def test_criterion_3_architecture_lists_the_six_steps():
    s = section("Architecture")
    assert re.findall(r"^\d\. \*\*(.+?)\*\*", s, re.MULTILINE)[:6] == [
        "Build CSVs", "Learn CPTs", "Graded notebook", "Publish", "Extension", "Nightly, on the device"]


def test_criterion_4_explains_rebuilding_csvs_and_cpts_json():
    s = section("Rebuild the CSVs and `cpts.json`")
    assert "python -m bsp_priors.publish --out site/cpts.json" in s
    for m in ("ingest_ubcgrades", "ingest_oulad", "ingest_studentlife", "publish"):
        assert f"bsp_priors.{m}" in s and (REPO / f"priors/bsp_priors/{m}.py").exists()


def test_criterion_5_no_sentence_says_you_will():
    assert not re.search(r"\byou will\b", README, re.IGNORECASE)
