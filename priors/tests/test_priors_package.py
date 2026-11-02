import importlib
import tomllib
from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_criterion_2_priors_pins_python_312_and_modules_import():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    assert project["requires-python"] == ">=3.12,<3.13"
    for m in ("ingest_ubcgrades", "ingest_oulad", "fit", "publish"):
        importlib.import_module(f"bsp_priors.{m}")
