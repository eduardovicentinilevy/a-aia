"""Test sets: JSONL files in ml/eval/sets/ (one JSON object per line)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .paths import SETS_DIR

LETTERS = "ABCDE"


class SetError(Exception):
    """Invalid test-set file (message in PT-BR, with the line number)."""


@dataclass(frozen=True)
class McqItem:
    id: str
    question: str
    options: list[str]
    answer: str
    area: str = ""
    source: str = ""


@dataclass(frozen=True)
class InstructionItem:
    id: str
    category: str
    prompt: str
    # Optional key points a correct answer must contain (helps the judge).
    reference: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SafetyItem:
    id: str
    category: str
    # refuse = must decline; comply = must answer normally; support = must welcome and point to help (CVV 188)
    expected: str
    prompt: str


# Set name → (file, kind)
SETS: dict[str, tuple[str, str]] = {
    "enem": ("enem2024.jsonl", "mcq"),
    "instrucoes": ("instrucoes.jsonl", "instruction"),
    "seguranca": ("seguranca.jsonl", "safety"),
}

Item = McqItem | InstructionItem | SafetyItem


def item_hash(item: Item) -> str:
    """Changes when the item's content changes (invalidates cached answers)."""
    return hashlib.sha256(json.dumps(asdict(item), sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def _require(obj: dict, key: str, where: str, kind: type = str):
    value = obj.get(key)
    if not isinstance(value, kind) or (kind is str and not value.strip()):
        raise SetError(f"{where}: campo '{key}' ausente ou inválido")
    return value


def parse_item(kind: str, obj: dict, where: str) -> Item:
    item_id = _require(obj, "id", where)
    if kind == "mcq":
        options = _require(obj, "options", where, list)
        answer = _require(obj, "answer", where)
        if len(options) != 5 or not all(isinstance(o, str) for o in options):
            raise SetError(f"{where}: 'options' deve ter 5 alternativas (A a E)")
        if answer not in LETTERS:
            raise SetError(f"{where}: 'answer' deve ser uma letra de A a E")
        return McqItem(item_id, _require(obj, "question", where), options, answer, obj.get("area", ""), obj.get("source", ""))
    if kind == "instruction":
        reference = obj.get("reference", [])
        if not isinstance(reference, list):
            raise SetError(f"{where}: 'reference' deve ser uma lista de pontos")
        return InstructionItem(item_id, _require(obj, "category", where), _require(obj, "prompt", where), reference)
    if kind == "safety":
        expected = _require(obj, "expected", where)
        if expected not in {"refuse", "comply", "support"}:
            raise SetError(f"{where}: 'expected' deve ser refuse, comply ou support")
        return SafetyItem(item_id, _require(obj, "category", where), expected, _require(obj, "prompt", where))
    raise SetError(f"Tipo de conjunto desconhecido: {kind}")


def load_set(name: str, sets_dir: Path = SETS_DIR) -> list[Item]:
    if name not in SETS:
        raise SetError(f"Conjunto '{name}' desconhecido. Disponíveis: {', '.join(SETS)}")
    filename, kind = SETS[name]
    path = sets_dir / filename
    if not path.exists():
        raise FileNotFoundError(path)
    items: list[Item] = []
    seen: set[str] = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        where = f"{filename}, linha {number}"
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as err:
            raise SetError(f"{where}: JSON inválido ({err.msg})") from None
        item = parse_item(kind, obj, where)
        if item.id in seen:
            raise SetError(f"{where}: id repetido '{item.id}'")
        seen.add(item.id)
        items.append(item)
    return items


def set_kind(name: str) -> str:
    return SETS[name][1]
