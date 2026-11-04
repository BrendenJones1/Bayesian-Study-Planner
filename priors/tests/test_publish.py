import json
import subprocess
import sys

from bsp_priors.fit import MODEL_VERSION


def test_criteria_1_and_2_publish_writes_file_with_model_version_and_built_at(tmp_path):
    out = tmp_path / "site" / "cpts.json"
    subprocess.run([sys.executable, "-m", "bsp_priors.publish", "--out", str(out)], check=True)
    data = json.loads(out.read_text())
    assert data["model_version"] == MODEL_VERSION
    assert data["built_at"]
    assert "tables" in data
