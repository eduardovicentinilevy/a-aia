"""Runs a model on the AçaIA test sets and writes a report.

Usage (from the repository root):
    python ml/eval/run.py --model mock
    python ml/eval/run.py --model pro --sets enem --limit 20
    python ml/eval/run.py --list

Answers are cached in ml/eval/results/<model>/ (not committed): running again only asks
what is missing or changed. The report goes to ml/eval/reports/<model>.md (and .json).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from acaia_eval.client import make_client
from acaia_eval.config import ConfigError, get_model, load_models
from acaia_eval.env import load_env
from acaia_eval.paths import MODELS_FILE, REPORTS_DIR, RESULTS_DIR, SETS_DIR, SYSTEM_PROMPT_FILE
from acaia_eval.report import build_report, write_report
from acaia_eval.results import ResultsStore, load_judgments
from acaia_eval.runner import run_set, score_records
from acaia_eval.sets import SETS, SetError, load_set, set_kind

EXIT_QUOTA = 3


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Avalia um modelo nos conjuntos da AçaIA.")
    parser.add_argument("--model", help="nome do modelo em ml/eval/models.toml")
    parser.add_argument("--sets", default=",".join(SETS), help=f"conjuntos separados por vírgula (padrão: {','.join(SETS)})")
    parser.add_argument("--limit", type=int, help="só os N primeiros itens de cada conjunto (teste rápido)")
    parser.add_argument("--report-only", action="store_true", help="não chama o modelo; só refaz o relatório")
    parser.add_argument("--list", action="store_true", help="lista os modelos cadastrados")
    return parser.parse_args(argv)


def main(
    argv: list[str] | None = None,
    *,
    models_file: Path = MODELS_FILE,
    sets_dir: Path = SETS_DIR,
    results_dir: Path = RESULTS_DIR,
    reports_dir: Path = REPORTS_DIR,
    env: dict[str, str] | None = None,
) -> int:
    args = parse_args(argv)
    try:
        if args.list:
            for name, model in load_models(models_file).items():
                judge = " (pode ser juiz)" if model.judge_allowed else ""
                print(f"{name:20} {model.provider:18} {model.model}{judge}")
            return 0
        if not args.model:
            print("Informe --model (veja --list).", file=sys.stderr)
            return 2
        if args.limit is not None and args.limit < 1:
            print("--limit deve ser um número maior que zero.", file=sys.stderr)
            return 2
        config = get_model(args.model, models_file)
        client = None if args.report_only else make_client(config, env if env is not None else load_env())
    except ConfigError as err:
        print(f"Erro de configuração: {err}", file=sys.stderr)
        return 2

    system_prompt = SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip()
    store = ResultsStore(results_dir, config.name)
    report_sets: dict[str, dict] = {}
    stopped = False
    judge_names: set[str] = set()

    for set_name in [s.strip() for s in args.sets.split(",") if s.strip()]:
        try:
            items = load_set(set_name, sets_dir)
        except FileNotFoundError:
            print(f"- {set_name}: conjunto ainda não existe (veja ml/eval/sets/README.md). Pulando.")
            continue
        except SetError as err:
            print(f"Erro no conjunto {set_name}: {err}", file=sys.stderr)
            return 2
        if args.limit:
            items = items[: args.limit]

        if client is not None and not stopped:
            print(f"- {set_name}: {len(items)} itens com {config.name} ({config.model})")
            progress = run_set(set_name=set_name, items=items, config=config, client=client, store=store, system_prompt=system_prompt)
            print(f"  {progress.new} novas, {progress.cached} do cache, {progress.errors} com erro")
            for message in progress.error_messages[:3]:
                print(f"    {message}")
            stopped = progress.stopped_by_quota

        answers = store.load(set_name)
        judgments, judge = load_judgments(store, set_name)
        if judge:
            judge_names.add(judge)
        report_sets[set_name] = {
            "kind": set_kind(set_name),
            "total": len(items),
            "scored": score_records(set_kind(set_name), items, answers),
            "answers": {i.id: answers[i.id] for i in items if i.id in answers},
            "judgments": [j for j in judgments if j["id"] in {i.id for i in items}],
        }

    if not report_sets:
        print("Nenhum conjunto disponível para avaliar.", file=sys.stderr)
        return 2
    markdown, data = build_report(config=config, sets=report_sets, judge_name=", ".join(sorted(judge_names)) or None)
    path = write_report(reports_dir, config.name, markdown, data)
    print(f"\nRelatório: {path}")
    if data["acaia_score"] is not None:
        print(f"Nota AçaIA: {data['acaia_score']:.1f}")
    return EXIT_QUOTA if stopped else 0


if __name__ == "__main__":
    sys.exit(main())
