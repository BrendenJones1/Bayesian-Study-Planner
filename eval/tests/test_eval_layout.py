from pathlib import Path


def test_pyproject_exists():
    assert (Path(__file__).parents[1] / "pyproject.toml").exists()
