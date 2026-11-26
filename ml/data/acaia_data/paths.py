"""Locations used by the dataset tools (and access to the evaluation package in ml/eval)."""

import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1]  # ml/data
REPO_ROOT = DATA_DIR.parents[1]
AUTHORED_DIR = DATA_DIR / "autorais"  # hand-written examples (committed)
CACHE_DIR = DATA_DIR / "cache"  # converted public datasets (not committed)
OUT_DIR = DATA_DIR / "out"  # train/val JSONL (not committed)
MANIFEST_FILE = DATA_DIR / "MANIFEST.md"  # what went into the last build (committed)
EVAL_DIR = REPO_ROOT / "ml" / "eval"

# The dataset tools reuse the evaluation package (sets, model client, safety heuristic).
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))
