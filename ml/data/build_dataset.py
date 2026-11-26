"""Builds the fine-tuning dataset of the AçaIA Copinho.

    python ml/data/build_dataset.py --check     # only validates the authored examples
    python ml/data/build_dataset.py             # builds ml/data/out/train.jsonl and val.jsonl

Steps: authored examples (ml/data/autorais/**/*.md, drafts excluded) + public sources already
downloaded to ml/data/cache/ (fetch_sources.py) → remove examples that overlap with ANY
evaluation question (decontamination) → remove duplicates (authored win) → upsample authored
examples → split train/val → write a manifest with counts and licenses.

Output format (TRL / Hugging Face chat format), one JSON per line:
    {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}],
     "source": "autoral" | "oasst2" | "aya", "id": "..."}
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from acaia_data.paths import AUTHORED_DIR, CACHE_DIR, MANIFEST_FILE, OUT_DIR  # also puts ml/eval on sys.path
from acaia_data.examples import Example, ExampleError, check_unique, parse_examples
from acaia_data.quality import Decontaminator, dedup_key
from acaia_data.sources import SOURCES

from acaia_eval.paths import SETS_DIR, SYSTEM_PROMPT_FILE
from acaia_eval.safety import classify
from acaia_eval.sets import SETS, InstructionItem, McqItem, SafetyItem, load_set

MIN_AUTHORED = 300  # CLAUDE.md, Phase 2


def load_authored(directory: Path) -> tuple[list[Example], list[Example], list[str]]:
    """(reviewed examples, drafts still to review, warnings)."""
    examples: list[Example] = []
    for path in sorted(directory.rglob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        examples.extend(parse_examples(path.read_text(encoding="utf-8"), str(path.relative_to(directory))))
    check_unique(examples)
    warnings = []
    for example in examples:
        answers = [m["content"] for m in example.messages if m["role"] == "assistant"]
        label = classify(answers[-1])
        if example.category == "recusa" and label == "comply":
            warnings.append(f"{example.file} '{example.id}': categoria recusa, mas a resposta não parece recusar")
        if example.category == "acolhimento" and label != "support":
            warnings.append(f"{example.file} '{example.id}': acolhimento deve indicar ajuda (ex.: CVV 188)")
    reviewed = [e for e in examples if not e.draft]
    drafts = [e for e in examples if e.draft]
    return reviewed, drafts, warnings


def eval_texts(sets_dir: Path) -> list[str]:
    texts: list[str] = []
    for name in SETS:
        try:
            items = load_set(name, sets_dir)
        except FileNotFoundError:
            continue
        for item in items:
            if isinstance(item, McqItem):
                texts.append(item.question)
            elif isinstance(item, (InstructionItem, SafetyItem)):
                texts.append(item.prompt)
    return texts


def load_cache(cache_dir: Path) -> dict[str, list[list[dict]]]:
    cached: dict[str, list[list[dict]]] = {}
    for name in SOURCES:
        path = cache_dir / f"{name}.jsonl"
        if path.exists():
            cached[name] = [json.loads(line)["messages"] for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return cached


def build(
    *,
    authored_dir: Path = AUTHORED_DIR,
    cache_dir: Path = CACHE_DIR,
    sets_dir: Path = SETS_DIR,
    out_dir: Path = OUT_DIR,
    manifest_file: Path = MANIFEST_FILE,
    system_prompt: str | None = None,
    upsample: int = 3,
    val_ratio: float = 0.05,
    seed: int = 42,
) -> dict:
    reviewed, drafts, warnings = load_authored(authored_dir)
    decontaminator = Decontaminator(eval_texts(sets_dir))
    stats: Counter = Counter()

    candidates: list[dict] = []
    for example in reviewed:
        candidates.append({"id": example.id, "source": "autoral", "category": example.category, "messages": example.messages})
    for source, conversations in load_cache(cache_dir).items():
        for index, messages in enumerate(conversations):
            candidates.append({"id": f"{source}-{index}", "source": source, "category": "geral", "messages": messages})

    kept: list[dict] = []
    seen: set[str] = set()
    for candidate in candidates:  # authored first, so they win duplicates
        text = "\n".join(m["content"] for m in candidate["messages"])
        if decontaminator.is_contaminated(text):
            stats[f"descartado_contaminacao:{candidate['source']}"] += 1
            continue
        key = dedup_key(candidate["messages"])
        if key in seen:
            stats[f"descartado_duplicado:{candidate['source']}"] += 1
            continue
        seen.add(key)
        kept.append(candidate)

    rng = random.Random(seed)
    authored = [c for c in kept if c["source"] == "autoral"]
    public = [c for c in kept if c["source"] != "autoral"]
    rng.shuffle(authored)
    rng.shuffle(public)
    # Validation set: a slice of each group, taken BEFORE upsampling (no copy leaks into val).
    val = authored[: round(len(authored) * val_ratio)] + public[: round(len(public) * val_ratio)]
    val_ids = {c["id"] for c in val}
    train = [c for c in authored if c["id"] not in val_ids] * upsample + [c for c in public if c["id"] not in val_ids]
    rng.shuffle(train)

    def with_system(candidate: dict) -> dict:
        messages = candidate["messages"]
        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}, *messages]
        return {"id": candidate["id"], "source": candidate["source"], "messages": messages}

    out_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, rows in (("train", train), ("val", val)):
        path = out_dir / f"{name}.jsonl"
        payload = "".join(json.dumps(with_system(r), ensure_ascii=False) + "\n" for r in rows)
        path.write_text(payload, encoding="utf-8")
        files[name] = {"rows": len(rows), "sha256": hashlib.sha256(payload.encode()).hexdigest()[:16]}

    by_source = Counter(c["source"] for c in kept)
    summary = {
        "authored_reviewed": len(reviewed),
        "authored_drafts_pending": len(drafts),
        "by_source": dict(by_source),
        "by_category": dict(Counter(c["category"] for c in authored)),
        "discarded": dict(stats),
        "files": files,
        "warnings": warnings,
        "upsample": upsample,
        "system_prompt": bool(system_prompt),
    }
    manifest_file.write_text(render_manifest(summary), encoding="utf-8")
    return summary


def render_manifest(summary: dict) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    source_rows = ["| autoral | escrito/revisado pelo Eduardo | — | " + str(summary["by_source"].get("autoral", 0)) + " |"]
    for name, meta in SOURCES.items():
        source_rows.append(f"| {name} | {meta['origin']} | {meta['license']} | {summary['by_source'].get(name, 0)} |")
    discarded = "\n".join(f"- {k}: {v}" for k, v in sorted(summary["discarded"].items())) or "- nenhum"
    categories = ", ".join(f"{k}: {v}" for k, v in sorted(summary["by_category"].items())) or "—"
    return f"""# Manifesto do dataset de ajuste fino

Gerado por `ml/data/build_dataset.py` em {now}. Os arquivos ficam em `ml/data/out/` (fora do Git).

| Fonte | Origem | Licença | Exemplos |
| --- | --- | --- | --- |
{chr(10).join(source_rows)}

- Autorais revisados: **{summary['authored_reviewed']}** (meta da Fase 2: ≥ {MIN_AUTHORED}) · rascunhos ainda não revisados (fora do treino): {summary['authored_drafts_pending']}
- Autorais por categoria: {categories}
- Autorais repetidos {summary['upsample']}× no treino (a persona precisa de peso) · system prompt da AçaIA incluído: {'sim' if summary['system_prompt'] else 'não'}
- Treino: {summary['files']['train']['rows']} linhas (sha256 {summary['files']['train']['sha256']}) · Validação: {summary['files']['val']['rows']} linhas (sha256 {summary['files']['val']['sha256']})

Descartados:
{discarded}
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Monta o dataset de ajuste fino do Copinho.")
    parser.add_argument("--check", action="store_true", help="só valida os exemplos autorais")
    parser.add_argument("--no-system-prompt", action="store_true", help="não inclui o system prompt da AçaIA nos exemplos")
    parser.add_argument("--upsample", type=int, default=3, help="quantas vezes repetir os autorais no treino (padrão 3)")
    args = parser.parse_args(argv)
    if args.upsample < 1:
        print("--upsample deve ser 1 ou mais.", file=sys.stderr)
        return 2
    try:
        if args.check:
            reviewed, drafts, warnings = load_authored(AUTHORED_DIR)
            print(f"{len(reviewed)} exemplos revisados, {len(drafts)} rascunhos a revisar (meta: ≥ {MIN_AUTHORED} revisados)")
            for warning in warnings:
                print(f"  aviso: {warning}")
            return 0
        system_prompt = None if args.no_system_prompt else SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip()
        summary = build(system_prompt=system_prompt, upsample=args.upsample)
    except ExampleError as err:
        print(f"Erro nos exemplos: {err}", file=sys.stderr)
        return 1
    print(f"treino: {summary['files']['train']['rows']} · validação: {summary['files']['val']['rows']} · fontes: {summary['by_source']}")
    for warning in summary["warnings"]:
        print(f"  aviso: {warning}")
    if summary["authored_reviewed"] < MIN_AUTHORED:
        print(f"  atenção: {summary['authored_reviewed']} autorais revisados; a Fase 2 pede pelo menos {MIN_AUTHORED}.")
    print(f"Manifesto: {MANIFEST_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
