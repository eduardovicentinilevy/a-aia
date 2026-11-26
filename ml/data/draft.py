"""Drafts answers with an OPEN model, for you to review and edit (docs/DECISIONS.md D-023).

    python ml/data/draft.py --model qwen35_4b --category persona \\
        --questions ml/data/autorais/perguntas/persona.txt

The questions file has one question per line (written by you). The answers are drafted by the
model with the AçaIA system prompt and saved to ml/data/autorais/rascunhos/<category>.md, each
marked `<!-- rascunho -->`. Drafts are NOT used for training until you review them, fix what
is wrong and delete the marker.

Only models with judge_allowed = true (open licenses that allow using their outputs) can draft:
never Claude or Gemini.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from acaia_data.examples import DRAFT_MARKER
from acaia_data.paths import AUTHORED_DIR

from acaia_eval.client import ModelError, make_client
from acaia_eval.config import ConfigError, get_model
from acaia_eval.env import load_env
from acaia_eval.paths import SYSTEM_PROMPT_FILE
from acaia_eval.text import strip_reasoning


def draft(questions: list[str], *, category: str, client, system_prompt: str, start: int = 1) -> str:
    blocks = []
    for number, question in enumerate(questions, start=start):
        completion = client.complete([{"role": "system", "content": system_prompt}, {"role": "user", "content": question}])
        answer = strip_reasoning(completion.text)
        blocks.append(f"## {category}-{number:03d} · {category}\n{DRAFT_MARKER}\n### usuario\n{question}\n### assistente\n{answer}\n")
    return "\n".join(blocks)


def main(argv: list[str] | None = None, *, env=None, out_dir: Path = AUTHORED_DIR / "rascunhos") -> int:
    parser = argparse.ArgumentParser(description="Rascunha respostas com um modelo aberto, para revisão humana.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--questions", required=True, type=Path)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.category):
        print("--category deve ser minúscula, sem espaço (ex.: persona, recusa).", file=sys.stderr)
        return 2
    try:
        config = get_model(args.model)
        if not config.judge_allowed:
            print(f"'{config.name}' não pode gerar rascunhos de treino (licença/termos; D-023). Use um modelo aberto com judge_allowed = true.", file=sys.stderr)
            return 2
        client = make_client(config, env if env is not None else load_env())
    except ConfigError as err:
        print(f"Erro de configuração: {err}", file=sys.stderr)
        return 2
    questions = [q.strip() for q in args.questions.read_text(encoding="utf-8").splitlines() if q.strip()]
    out = out_dir / f"{args.category}.md"
    start = out.read_text(encoding="utf-8").count(f" · {args.category}\n") + 1 if out.exists() else 1
    try:
        text = draft(questions, category=args.category, client=client, system_prompt=SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip(), start=start)
    except ModelError as err:
        print(f"Erro do modelo: {err}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("a", encoding="utf-8") as file:
        file.write(("\n" if start > 1 else "") + text)
    print(f"{len(questions)} rascunhos em {out}. Revise cada um e apague a linha {DRAFT_MARKER} quando estiver bom.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
