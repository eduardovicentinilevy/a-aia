"""Answer cache: results/<model>/<set>.jsonl, append-only.

Each answer is written the moment it arrives, so a run interrupted by a free-tier quota
continues where it stopped. An answer is reused only if neither the question nor the
model settings changed since it was produced.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ResultsStore:
    root: Path
    model: str

    def path(self, set_name: str) -> Path:
        return self.root / self.model / f"{set_name}.jsonl"

    def load(self, set_name: str) -> dict[str, dict]:
        """Latest record per item id."""
        path = self.path(set_name)
        latest: dict[str, dict] = {}
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    record = json.loads(line)
                    latest[record["id"]] = record
        return latest

    def append(self, set_name: str, record: dict) -> None:
        path = self.path(set_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def is_fresh(record: dict | None, item_hash: str, config_fingerprint: str) -> bool:
    return bool(
        record
        and not record.get("error")
        and record.get("item_hash") == item_hash
        and record.get("config") == config_fingerprint
    )


def load_judgments(store: ResultsStore, set_name: str) -> tuple[list[dict], str | None]:
    """Verdicts written by judge.py (latest per item) and the judge's name, if any."""
    path = store.root / store.model / f"{set_name}.judge.jsonl"
    latest: dict[str, dict] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                record = json.loads(line)
                if not record.get("error"):
                    latest[record["id"]] = record
    judges = {r.get("judge") for r in latest.values()}
    return list(latest.values()), (judges.pop() if len(judges) == 1 else None)
