"""Runs a model over the test sets and saves every answer."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Protocol

from . import mcq
from .client import Completion, Message, ModelError
from .config import ModelConfig
from .results import ResultsStore, is_fresh
from .sets import InstructionItem, Item, McqItem, SafetyItem, item_hash


class Client(Protocol):
    def complete(self, messages: list[Message]) -> Completion: ...


def build_messages(system_prompt: str, item: Item) -> list[Message]:
    user = mcq.format_prompt(item) if isinstance(item, McqItem) else item.prompt
    return [{"role": "system", "content": system_prompt}, {"role": "user", "content": user}]


@dataclass
class SetProgress:
    total: int = 0
    cached: int = 0
    new: int = 0
    errors: int = 0
    stopped_by_quota: bool = False
    error_messages: list[str] = field(default_factory=list)


def run_set(
    *,
    set_name: str,
    items: list[Item],
    config: ModelConfig,
    client: Client,
    store: ResultsStore,
    system_prompt: str,
    log: Callable[[str], None] = print,
) -> SetProgress:
    progress = SetProgress(total=len(items))
    existing = store.load(set_name)
    fingerprint = config.fingerprint()
    for index, item in enumerate(items, start=1):
        digest = item_hash(item)
        if is_fresh(existing.get(item.id), digest, fingerprint):
            progress.cached += 1
            continue
        record = {
            "id": item.id,
            "item_hash": digest,
            "config": fingerprint,
            "model": config.model,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        try:
            completion = client.complete(build_messages(system_prompt, item))
        except ModelError as err:
            progress.errors += 1
            progress.error_messages.append(f"{item.id}: {err}")
            store.append(set_name, {**record, "error": str(err)})
            if err.quota:
                progress.stopped_by_quota = True
                log(f"  {set_name}: o provedor recusou por limite de uso (429). Progresso salvo; rode de novo mais tarde.")
                break
            continue
        store.append(
            set_name,
            {
                **record,
                "output": completion.text,
                "latency_ms": completion.latency_ms,
                "tokens_in": completion.tokens_in,
                "tokens_out": completion.tokens_out,
                "finish_reason": completion.finish_reason,
            },
        )
        progress.new += 1
        if progress.new % 10 == 0:
            log(f"  {set_name}: {index}/{len(items)}")
    return progress


def score_records(set_kind: str, items: list[Item], answers: dict[str, dict]) -> list[dict]:
    """Automatic scoring of saved answers (no judge needed): MCQ and the safety heuristic."""
    from .safety import classify, is_correct
    from .text import strip_reasoning

    scored: list[dict] = []
    for item in items:
        answer = answers.get(item.id)
        if not answer or answer.get("error"):
            continue
        output = strip_reasoning(answer["output"])
        if isinstance(item, McqItem):
            choice = mcq.extract_choice(output)
            scored.append({"id": item.id, "area": item.area, "choice": choice, "correct": choice == item.answer})
        elif isinstance(item, SafetyItem):
            label = classify(output)
            scored.append({"id": item.id, "category": item.category, "expected": item.expected, "label": label, "correct": is_correct(item.expected, label)})
        elif isinstance(item, InstructionItem):
            scored.append({"id": item.id, "category": item.category})
    return scored
