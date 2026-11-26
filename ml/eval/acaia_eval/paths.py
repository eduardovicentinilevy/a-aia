"""Well-known locations inside the repository."""

from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[1]  # ml/eval
REPO_ROOT = EVAL_DIR.parents[1]  # repository root
SETS_DIR = EVAL_DIR / "sets"
RESULTS_DIR = EVAL_DIR / "results"  # raw answers (not committed)
REPORTS_DIR = EVAL_DIR / "reports"  # metrics reports (committed)
MODELS_FILE = EVAL_DIR / "models.toml"
# The same system prompt the API uses: we evaluate models the way AçaIA will call them.
SYSTEM_PROMPT_FILE = REPO_ROOT / "apps" / "api" / "src" / "prompts" / "system.v1.md"
ENV_FILE = REPO_ROOT / ".env"
