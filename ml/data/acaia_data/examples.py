"""Authored training examples, written in Markdown (ml/data/autorais/*.md):

    ## ex-001 · persona
    ### usuario
    Quem é você?
    ### assistente
    Oi! Eu sou a AçaIA, uma assistente brasileira...

Conversations may have several turns (### usuario / ### assistente alternating, ending with
### assistente). A line `<!-- rascunho -->` marks a draft made by a model: drafts are NOT used
for training until a person reviews them and deletes the marker.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

DRAFT_MARKER = "<!-- rascunho -->"
_HEADER = re.compile(r"^##\s+(?P<id>[a-z0-9][a-z0-9_-]*)\s*·\s*(?P<category>[a-z0-9][a-z0-9_-]*)\s*$")
_ROLE = {"### usuario": "user", "### usuário": "user", "### assistente": "assistant"}
MAX_TURN_CHARS = 6000


class ExampleError(Exception):
    pass


@dataclass
class Example:
    id: str
    category: str
    messages: list[dict] = field(default_factory=list)
    draft: bool = False
    file: str = ""
    line: int = 0


def parse_examples(text: str, filename: str = "arquivo") -> list[Example]:
    examples: list[Example] = []
    current: Example | None = None
    role: str | None = None
    buffer: list[str] = []

    def flush_turn() -> None:
        if current is not None and role is not None:
            content = "\n".join(buffer).strip()
            if not content:
                raise ExampleError(f"{filename}, item '{current.id}': há uma fala vazia")
            current.messages.append({"role": role, "content": content})

    def close() -> None:
        flush_turn()
        if current is None:
            return
        roles = [m["role"] for m in current.messages]
        where = f"{filename}, linha {current.line} ('{current.id}')"
        if not roles:
            raise ExampleError(f"{where}: sem falas (use ### usuario e ### assistente)")
        if roles[0] != "user" or roles[-1] != "assistant":
            raise ExampleError(f"{where}: deve começar com ### usuario e terminar com ### assistente")
        if any(a == b for a, b in zip(roles, roles[1:])):
            raise ExampleError(f"{where}: as falas devem alternar usuario/assistente")
        too_long = [m for m in current.messages if len(m["content"]) > MAX_TURN_CHARS]
        if too_long:
            raise ExampleError(f"{where}: fala com mais de {MAX_TURN_CHARS} caracteres")
        examples.append(current)

    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()
        if line.startswith("## ") and not line.startswith("### "):
            close()
            match = _HEADER.match(line)
            if not match:
                raise ExampleError(f"{filename}, linha {number}: cabeçalho deve ser '## id · categoria' (minúsculas, sem espaço)")
            current, role, buffer = Example(match["id"], match["category"], file=filename, line=number), None, []
            continue
        if current is None:
            continue  # title / intro before the first example
        if line.strip() == DRAFT_MARKER:
            current.draft = True
            continue
        if line.strip().lower() in _ROLE:
            flush_turn()
            role, buffer = _ROLE[line.strip().lower()], []
            continue
        if role is None:
            if line.strip() and not line.strip().startswith("<!--"):
                raise ExampleError(f"{filename}, linha {number}: texto fora de uma fala (falta ### usuario?)")
            continue
        buffer.append(line)
    close()
    return examples


def check_unique(examples: list[Example]) -> None:
    seen: dict[str, str] = {}
    for example in examples:
        if example.id in seen:
            raise ExampleError(f"id repetido '{example.id}' em {seen[example.id]} e {example.file}")
        seen[example.id] = example.file
