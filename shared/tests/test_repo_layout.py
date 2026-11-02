from pathlib import Path

REPO = Path(__file__).parents[2]

# Mirrors the repo tree in docs/design.md (Tech stack section).
EXPECTED = [
    *(f"extension/src/{d}" for d in ("canvas", "timer", "quiz", "model", "planner", "storage", "ui")),
    *(f"priors/bsp_priors/{m}.py" for m in ("ingest_ubcgrades", "ingest_oulad", "fit", "publish")),
    "eval",
    "shared/fixtures/README.md",
]


def test_criterion_4_layout_matches_design_doc_repo_tree():
    missing = [p for p in EXPECTED if not (REPO / p).exists()]
    assert not missing
