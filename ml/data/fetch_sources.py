"""Downloads the public Portuguese datasets, re-checks their license and converts them.

Runs where Hugging Face is reachable (your PC or Kaggle), with the `datasets` library:
    pip install -r ml/requirements-data.txt
    python ml/data/fetch_sources.py            # all sources
    python ml/data/fetch_sources.py aya        # only one

Writes ml/data/cache/<source>.jsonl (not committed). Refuses a source whose license on
Hugging Face is no longer the one we approved in acaia_data/sources.py.
"""

from __future__ import annotations

import json
import sys

from acaia_data.paths import CACHE_DIR
from acaia_data.sources import CONVERTERS, SOURCES


def fetch(name: str) -> int:
    from datasets import load_dataset  # optional dependency, only needed here
    from huggingface_hub import dataset_info

    meta = SOURCES[name]
    last_error: Exception | None = None
    for repo in meta["repos"]:
        try:
            info = dataset_info(repo)
        except Exception as err:  # noqa: BLE001 — try the next known name
            last_error = err
            continue
        licenses = [t.split(":", 1)[1] for t in info.tags if t.startswith("license:")]
        if meta["license"] not in licenses:
            raise SystemExit(f"{name}: licença no Hugging Face é {licenses or 'não declarada'}, esperado {meta['license']}. Não vou usar.")
        rows = [dict(row) for split in load_dataset(repo).values() for row in split]
        conversations = CONVERTERS[name](rows)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = CACHE_DIR / f"{name}.jsonl"
        path.write_text("".join(json.dumps({"messages": c}, ensure_ascii=False) + "\n" for c in conversations), encoding="utf-8")
        print(f"{name}: {len(conversations)} conversas em português ({repo}, licença {meta['license']}) → {path}")
        return len(conversations)
    raise SystemExit(f"{name}: não encontrei o dataset ({last_error})")


if __name__ == "__main__":
    for source in sys.argv[1:] or list(SOURCES):
        fetch(source)
