import importlib
import tomllib
from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_criterion_2_eval_pins_python_312_and_package_imports():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    assert project["requires-python"] == ">=3.12,<3.13"
    importlib.import_module("bsp_eval")
