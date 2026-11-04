"""Write cpts.json for GitHub Pages: python -m bsp_priors.publish --out site/cpts.json.

Design: docs/design-v2.md (Learning the CPTs, step 4 Publish). The tables come from fit.build.
"""

import argparse
import json
from pathlib import Path

from bsp_priors.fit import build


def publish(out: Path) -> dict:
    """Build the CPTs and write them to out (parent directories are created)."""
    data = build()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    return data


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    publish(ap.parse_args().out)
