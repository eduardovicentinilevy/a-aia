"""Builds the JSONL test sets in ml/eval/sets/.

    python ml/eval/build_sets.py            # all of them
    python ml/eval/build_sets.py enem       # only ENEM 2024 (downloads the pinned source file)
    python ml/eval/build_sets.py autorais   # only the hand-written sets (sets/fontes/*.md)
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

from acaia_eval.authoring import AuthoringError, parse_markdown
from acaia_eval.enem import SOURCE_URL, convert_row
from acaia_eval.paths import SETS_DIR
from acaia_eval.sets import SetError, load_set

AUTHORED = {"instrucoes": "instruction", "seguranca": "safety"}


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def build_enem(sets_dir: Path = SETS_DIR, source: str | None = None) -> int:
    if source and not source.startswith("http"):
        raw = Path(source).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(source or SOURCE_URL, timeout=60) as response:
            raw = response.read().decode("utf-8")
    rows = [convert_row(json.loads(line)) for line in raw.splitlines() if line.strip()]
    kept = [r for r in rows if r is not None]
    write_jsonl(sets_dir / "enem2024.jsonl", kept)
    load_set("enem", sets_dir)  # validate what we wrote
    print(f"enem2024.jsonl: {len(kept)} questões ({len(rows) - len(kept)} anulada(s) fora)")
    return len(kept)


def build_authored(sets_dir: Path = SETS_DIR) -> None:
    for name, kind in AUTHORED.items():
        source = sets_dir / "fontes" / f"{name}.md"
        if not source.exists():
            print(f"{name}: {source.relative_to(sets_dir.parent)} ainda não existe (veja sets/README.md)")
            continue
        items = parse_markdown(kind, source.read_text(encoding="utf-8"), source.name)
        if not items:
            print(f"{name}: {source.name} ainda não tem itens (veja sets/README.md)")
            continue
        write_jsonl(sets_dir / f"{name}.jsonl", items)
        load_set(name, sets_dir)
        print(f"{name}.jsonl: {len(items)} itens")


def main(argv: list[str]) -> int:
    which = argv[0] if argv else "todos"
    try:
        if which in {"todos", "enem"}:
            build_enem(source=argv[1] if len(argv) > 1 else None)
        if which in {"todos", "autorais"}:
            build_authored()
    except (AuthoringError, SetError) as err:
        print(f"Erro: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
