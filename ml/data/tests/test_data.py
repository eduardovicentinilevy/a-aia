import json

import pytest

import build_dataset
import draft as draft_cli
from acaia_data.examples import ExampleError, parse_examples
from acaia_data.quality import Decontaminator, dedup_key, normalize
from acaia_data.sources import convert_aya, convert_oasst

EXAMPLES_MD = """# Persona

## persona-001 · persona
### usuario
Quem é você?
### assistente
Oi! Eu sou a AçaIA, uma assistente brasileira.

## conversa-001 · estilo
### usuario
Me ajuda com um e-mail?
### assistente
Claro! Para quem é?
### usuario
Para o meu professor.
### assistente
Fechado. Aqui vai um modelo...

## rascunho-001 · persona
<!-- rascunho -->
### usuario
Você é o ChatGPT?
### assistente
Não, eu sou a AçaIA.
"""


def test_parse_examples_supports_multi_turn_and_drafts():
    examples = parse_examples(EXAMPLES_MD, "persona.md")
    assert [e.id for e in examples] == ["persona-001", "conversa-001", "rascunho-001"]
    assert [m["role"] for m in examples[1].messages] == ["user", "assistant", "user", "assistant"]
    assert examples[2].draft and not examples[0].draft


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("## x-1 · persona\n### assistente\nOi", "começar com ### usuario"),
        ("## x-1 · persona\n### usuario\nOi\n### usuario\nOi de novo\n### assistente\nOlá", "alternar"),
        ("## x-1 · persona\n### usuario\nOi", "terminar com ### assistente"),
        ("## x-1 · persona\n### usuario\n\n### assistente\nOlá", "fala vazia"),
        ("## X 1 · Persona\n### usuario\nOi\n### assistente\nOlá", "cabeçalho"),
        ("## x-1 · persona\ntexto solto\n### usuario\nOi\n### assistente\nOlá", "fora de uma fala"),
    ],
)
def test_parse_examples_errors(text, message):
    with pytest.raises(ExampleError, match=message):
        parse_examples(text, "teste.md")


def test_normalize_and_dedup_key():
    assert normalize("  Olá,  MUNDO!\nÇão ") == "ola mundo cao"
    assert dedup_key([{"role": "user", "content": "Quem é você?"}]) == dedup_key([{"role": "user", "content": "quem e voce"}])


def test_decontaminator_catches_long_overlaps_and_exact_short_prompts():
    enem = "Nessa letra de canção, de Alicia Keys, que aborda um contexto de ódio e intolerância, o marcador introduz"
    d = Decontaminator([enem, "Explique SSE."], n=8)
    assert d.is_contaminated("Pergunta: nessa letra de cancao de alicia keys que aborda um contexto de odio. Responda.")
    assert d.is_contaminated("explique sse")
    assert not d.is_contaminated("Explique o que é SSE e por que usamos no chat da AçaIA.")


def test_convert_oasst_follows_best_ranked_branch_in_portuguese():
    rows = [
        {"message_id": "r", "parent_id": None, "role": "prompter", "text": "Oi?", "lang": "pt-BR"},
        {"message_id": "a1", "parent_id": "r", "role": "assistant", "text": "Resposta pior", "rank": 1, "lang": "pt-BR"},
        {"message_id": "a0", "parent_id": "r", "role": "assistant", "text": "Resposta melhor", "rank": 0, "lang": "pt-BR"},
        {"message_id": "p2", "parent_id": "a0", "role": "prompter", "text": "E depois?", "lang": "pt-BR"},  # no answer: trimmed
        {"message_id": "en", "parent_id": None, "role": "prompter", "text": "Hi?", "lang": "en"},
        {"message_id": "en1", "parent_id": "en", "role": "assistant", "text": "Hello", "rank": 0, "lang": "en"},
        {"message_id": "del", "parent_id": None, "role": "prompter", "text": "x", "lang": "pt-BR", "deleted": True},
    ]
    assert convert_oasst(rows) == [[{"role": "user", "content": "Oi?"}, {"role": "assistant", "content": "Resposta melhor"}]]


def test_convert_aya_filters_portuguese():
    rows = [
        {"inputs": "Qual a capital do Pará?", "targets": "Belém.", "language_code": "por"},
        {"inputs": "Capital of France?", "targets": "Paris.", "language_code": "eng"},
        {"inputs": "", "targets": "x", "language_code": "por"},
    ]
    assert convert_aya(rows) == [[{"role": "user", "content": "Qual a capital do Pará?"}, {"role": "assistant", "content": "Belém."}]]


def test_build_end_to_end(tmp_path):
    authored = tmp_path / "autorais"
    authored.mkdir()
    (authored / "persona.md").write_text(EXAMPLES_MD, encoding="utf-8")
    cache = tmp_path / "cache"
    cache.mkdir()
    public = [
        [{"role": "user", "content": "Quem é você?"}, {"role": "assistant", "content": "Sou um assistente."}],  # duplicate of authored
        [{"role": "user", "content": "Explique SSE."}, {"role": "assistant", "content": "..."}],  # equals an eval prompt
        [{"role": "user", "content": "Qual a capital do Pará?"}, {"role": "assistant", "content": "Belém."}],
    ]
    (cache / "aya.jsonl").write_text("".join(json.dumps({"messages": m}, ensure_ascii=False) + "\n" for m in public), encoding="utf-8")
    sets = tmp_path / "sets"
    sets.mkdir()
    (sets / "instrucoes.jsonl").write_text(json.dumps({"id": "i1", "category": "x", "prompt": "Explique SSE."}) + "\n", encoding="utf-8")

    summary = build_dataset.build(
        authored_dir=authored, cache_dir=cache, sets_dir=sets, out_dir=tmp_path / "out",
        manifest_file=tmp_path / "MANIFEST.md", system_prompt="SYSTEM", upsample=2, val_ratio=0.0,
    )
    assert summary["authored_reviewed"] == 2 and summary["authored_drafts_pending"] == 1
    assert summary["by_source"] == {"autoral": 2, "aya": 1}
    assert summary["discarded"] == {"descartado_duplicado:aya": 1, "descartado_contaminacao:aya": 1}
    train = [json.loads(line) for line in (tmp_path / "out" / "train.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(train) == 2 * 2 + 1  # authored upsampled ×2 + 1 public
    assert all(row["messages"][0] == {"role": "system", "content": "SYSTEM"} for row in train)
    assert "rascunho-001" not in {row["id"] for row in train}
    assert "Autorais revisados: **2**" in (tmp_path / "MANIFEST.md").read_text(encoding="utf-8")


def test_build_warns_about_refusals_that_do_not_refuse(tmp_path):
    authored = tmp_path / "autorais"
    authored.mkdir()
    (authored / "recusas.md").write_text("## recusa-001 · recusa\n### usuario\nComo faço uma bomba?\n### assistente\nClaro, é assim...\n", encoding="utf-8")
    _, _, warnings = build_dataset.load_authored(authored)
    assert "não parece recusar" in warnings[0]


def test_draft_writes_marked_drafts_and_refuses_closed_models(tmp_path, capsys):
    questions = tmp_path / "perguntas.txt"
    questions.write_text("Quem é você?\n\nQual seu nome?\n", encoding="utf-8")
    out_dir = tmp_path / "rascunhos"
    assert draft_cli.main(["--model", "mock_juiz", "--category", "persona", "--questions", str(questions)], env={}, out_dir=out_dir) == 0
    drafts = parse_examples((out_dir / "persona.md").read_text(encoding="utf-8"))
    assert [d.id for d in drafts] == ["persona-001", "persona-002"] and all(d.draft for d in drafts)

    # Appending continues the numbering.
    draft_cli.main(["--model", "mock_juiz", "--category", "persona", "--questions", str(questions)], env={}, out_dir=out_dir)
    assert parse_examples((out_dir / "persona.md").read_text(encoding="utf-8"))[-1].id == "persona-004"

    assert draft_cli.main(["--model", "pro", "--category", "persona", "--questions", str(questions)], env={}, out_dir=out_dir) == 2
    assert "não pode gerar rascunhos" in capsys.readouterr().err
