"""Judges the saved answers of a model (rubric for instructions, refusal class for safety).

Usage (from the repository root):
    python ml/eval/judge.py --model pro --judge juiz
    python ml/eval/judge.py --model pro --export-human 20     # sample for YOU to score by hand
    python ml/eval/judge.py --model pro --agreement            # how much you and the judge agree

Only models with judge_allowed = true in models.toml can judge (docs/DECISIONS.md D-023).
Verdicts are cached like answers: judging again only covers new or changed answers.
"""

from __future__ import annotations

import argparse
import hashlib
import random
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import run as run_cli
from acaia_eval.client import ModelError, make_client
from acaia_eval.config import ConfigError, get_model
from acaia_eval.env import load_env
from acaia_eval.judging import JUDGE_SYSTEM, JudgeParseError, parse_rubric, parse_safety, rubric_prompt, safety_prompt
from acaia_eval.metrics import RUBRIC_CRITERIA, agreement
from acaia_eval.paths import EVAL_DIR, MODELS_FILE, REPORTS_DIR, RESULTS_DIR, SETS_DIR
from acaia_eval.results import ResultsStore, load_judgments
from acaia_eval.sets import InstructionItem, SafetyItem, load_set
from acaia_eval.text import strip_reasoning

HUMAN_DIR = EVAL_DIR / "human"
JUDGED_SETS = ("instrucoes", "seguranca")


def answer_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def judge_set(*, set_name, items, answers, store, judge_config, client, log=print) -> dict:
    existing = {j["id"]: j for j in load_judgments(store, set_name)[0]}
    path = store.root / store.model / f"{set_name}.judge.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    counts = {"new": 0, "cached": 0, "errors": 0, "quota": False}
    fingerprint = judge_config.fingerprint()
    with path.open("a", encoding="utf-8") as file:
        for item in items:
            answer = answers.get(item.id)
            if not answer or answer.get("error"):
                continue
            text = strip_reasoning(answer["output"])
            digest = answer_hash(text)
            previous = existing.get(item.id)
            if previous and previous.get("answer_hash") == digest and previous.get("judge_config") == fingerprint:
                counts["cached"] += 1
                continue
            prompt = rubric_prompt(item, text) if isinstance(item, InstructionItem) else safety_prompt(item, text)
            record = {"id": item.id, "judge": judge_config.name, "judge_config": fingerprint, "answer_hash": digest, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            try:
                completion = client.complete([{"role": "system", "content": JUDGE_SYSTEM}, {"role": "user", "content": prompt}])
                verdict = parse_rubric(completion.text) if isinstance(item, InstructionItem) else parse_safety(completion.text)
            except ModelError as err:
                counts["errors"] += 1
                file.write(_json({**record, "error": str(err)}))
                if err.quota:
                    counts["quota"] = True
                    log(f"  {set_name}: limite de uso do juiz atingido. Progresso salvo.")
                    break
                continue
            except JudgeParseError as err:
                counts["errors"] += 1
                file.write(_json({**record, "error": f"resposta do juiz ilegível: {err}"}))
                continue
            file.write(_json({**record, **verdict}))
            file.flush()
            counts["new"] += 1
    return counts


def _json(obj: dict) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False) + "\n"


# --- Human sample -----------------------------------------------------------------------------
_HUMAN_ITEM = re.compile(r"<!-- item: (?P<id>[^ ]+) -->(?P<body>.*?)(?=<!-- item: |\Z)", re.DOTALL)
_HUMAN_SCORE = re.compile(r"^nota:\s*([1-5](?:[.,]5)?)\s*$", re.MULTILINE)


def export_human(model: str, items, answers, n: int, path: Path, seed: int = 7) -> int:
    answered = [i for i in items if i.id in answers and not answers[i.id].get("error")]
    sample = random.Random(seed).sample(answered, min(n, len(answered)))
    parts = [
        f"# Avaliação humana — `{model}` ({len(sample)} respostas)\n",
        "Dê uma **nota geral de 1 a 5** para cada resposta, pensando nos mesmos critérios do juiz: correção, utilidade, "
        "português, tom da AçaIA e concisão. Preencha a linha `nota:` (pode usar meio ponto, ex.: 3,5) e salve.\n",
        f"Depois rode: `python ml/eval/judge.py --model {model} --agreement`\n",
    ]
    for item in sample:
        answer = strip_reasoning(answers[item.id]["output"])
        parts.append(f"\n---\n<!-- item: {item.id} -->\n\n**Pergunta ({item.category}):**\n\n{item.prompt}\n\n**Resposta:**\n\n{answer}\n\nnota: \n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(parts), encoding="utf-8")
    return len(sample)


def read_human_scores(text: str) -> dict[str, float]:
    scores: dict[str, float] = {}
    for match in _HUMAN_ITEM.finditer(text):
        found = _HUMAN_SCORE.findall(match.group("body"))
        if found:
            scores[match.group("id")] = float(found[-1].replace(",", "."))
    return scores


def main(argv: list[str] | None = None, *, models_file=MODELS_FILE, sets_dir=SETS_DIR, results_dir=RESULTS_DIR, reports_dir=REPORTS_DIR, human_dir=HUMAN_DIR, env=None) -> int:
    parser = argparse.ArgumentParser(description="Juiz da avaliação da AçaIA.")
    parser.add_argument("--model", required=True, help="modelo AVALIADO (cujas respostas serão julgadas)")
    parser.add_argument("--judge", help="modelo JUIZ (precisa de judge_allowed = true)")
    parser.add_argument("--sets", default=",".join(JUDGED_SETS))
    parser.add_argument("--export-human", type=int, metavar="N", help="exporta N respostas de instruções para nota humana")
    parser.add_argument("--agreement", action="store_true", help="compara suas notas com as do juiz")
    args = parser.parse_args(argv)

    try:
        evaluated = get_model(args.model, models_file)
    except ConfigError as err:
        print(f"Erro de configuração: {err}", file=sys.stderr)
        return 2
    store = ResultsStore(results_dir, evaluated.name)
    human_path = human_dir / f"{evaluated.name}.md"

    def load(set_name):
        try:
            return load_set(set_name, sets_dir)
        except FileNotFoundError:
            return None

    if args.export_human:
        items = load("instrucoes")
        if not items:
            print("O conjunto de instruções ainda não existe.", file=sys.stderr)
            return 2
        count = export_human(evaluated.name, items, store.load("instrucoes"), args.export_human, human_path)
        print(f"{count} respostas exportadas para {human_path}. Preencha as notas e rode --agreement.")
        return 0

    if args.agreement:
        if not human_path.exists():
            print(f"Arquivo {human_path} não existe. Rode antes com --export-human 20.", file=sys.stderr)
            return 2
        human = read_human_scores(human_path.read_text(encoding="utf-8"))
        judged = {j["id"]: sum(j[c] for c in RUBRIC_CRITERIA) / len(RUBRIC_CRITERIA) for j in load_judgments(store, "instrucoes")[0]}
        pairs = [(score, judged[item_id]) for item_id, score in human.items() if item_id in judged]
        result = agreement(pairs)
        if not result["n"]:
            print("Nenhum item com nota humana E nota do juiz ainda.", file=sys.stderr)
            return 2
        within = result["within_one"]
        print(f"{result['n']} itens · diferença média {result['mean_abs_diff']:.2f} ponto · {within.hits}/{within.total} com diferença ≤ 1 ponto ({within.value:.0%})".replace(".", ","))
        print("Regra prática: ≥ 80% dentro de 1 ponto → dá para confiar no juiz; abaixo disso, revise o juiz ou a rubrica.")
        return 0

    if not args.judge:
        print("Informe --judge (ex.: --judge juiz).", file=sys.stderr)
        return 2
    try:
        judge_config = get_model(args.judge, models_file)
        if not judge_config.judge_allowed:
            print(
                f"'{judge_config.name}' não pode ser juiz: só modelos com judge_allowed = true no models.toml "
                "(licença aberta que permite usar as saídas; docs/DECISIONS.md D-023).",
                file=sys.stderr,
            )
            return 2
        client = make_client(judge_config, env if env is not None else load_env())
    except ConfigError as err:
        print(f"Erro de configuração: {err}", file=sys.stderr)
        return 2

    stopped = False
    for set_name in [s.strip() for s in args.sets.split(",") if s.strip()]:
        if set_name not in JUDGED_SETS:
            print(f"- {set_name}: não precisa de juiz. Pulando.")
            continue
        items = load(set_name)
        if not items:
            print(f"- {set_name}: conjunto ainda não existe. Pulando.")
            continue
        print(f"- {set_name}: julgando respostas de {evaluated.name} com {judge_config.name}")
        counts = judge_set(set_name=set_name, items=items, answers=store.load(set_name), store=store, judge_config=judge_config, client=client)
        print(f"  {counts['new']} novos, {counts['cached']} do cache, {counts['errors']} com erro")
        if counts["quota"]:
            stopped = True
            break

    # Refresh the report with the verdicts.
    run_cli.main(["--model", evaluated.name, "--report-only"], models_file=models_file, sets_dir=sets_dir, results_dir=results_dir, reports_dir=reports_dir, env={})
    return run_cli.EXIT_QUOTA if stopped else 0


if __name__ == "__main__":
    sys.exit(main())
