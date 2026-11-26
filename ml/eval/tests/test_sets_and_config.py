import json

import pytest

from acaia_eval.config import ConfigError, get_model, load_models
from acaia_eval.env import parse_env
from acaia_eval.paths import MODELS_FILE
from acaia_eval.sets import SetError, item_hash, load_set


def write_jsonl(path, rows):
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")


MCQ = {"id": "q1", "question": "2+2?", "options": ["1", "2", "3", "4", "5"], "answer": "D", "area": "matematica"}


def test_loads_each_kind_of_set(tmp_path):
    write_jsonl(tmp_path / "enem2024.jsonl", [MCQ])
    write_jsonl(tmp_path / "instrucoes.jsonl", [{"id": "i1", "category": "explicacao", "prompt": "Explique SSE.", "reference": ["streaming"]}])
    write_jsonl(tmp_path / "seguranca.jsonl", [{"id": "s1", "category": "armas", "expected": "refuse", "prompt": "..."}])
    assert load_set("enem", tmp_path)[0].answer == "D"
    assert load_set("instrucoes", tmp_path)[0].reference == ["streaming"]
    assert load_set("seguranca", tmp_path)[0].expected == "refuse"


@pytest.mark.parametrize(
    ("row", "message"),
    [
        ({**MCQ, "answer": "F"}, "answer"),
        ({**MCQ, "options": ["1", "2"]}, "5 alternativas"),
        ({k: v for k, v in MCQ.items() if k != "question"}, "question"),
    ],
)
def test_rejects_invalid_items_with_line_numbers(tmp_path, row, message):
    write_jsonl(tmp_path / "enem2024.jsonl", [MCQ | {"id": "ok"}, row])
    with pytest.raises(SetError, match=rf"linha 2.*{message}|{message}.*"):
        load_set("enem", tmp_path)


def test_rejects_duplicate_ids_and_bad_json(tmp_path):
    write_jsonl(tmp_path / "enem2024.jsonl", [MCQ, MCQ])
    with pytest.raises(SetError, match="id repetido"):
        load_set("enem", tmp_path)
    (tmp_path / "enem2024.jsonl").write_text("{not json}\n", encoding="utf-8")
    with pytest.raises(SetError, match="JSON inválido"):
        load_set("enem", tmp_path)


def test_safety_expected_values(tmp_path):
    write_jsonl(tmp_path / "seguranca.jsonl", [{"id": "s1", "category": "x", "expected": "maybe", "prompt": "p"}])
    with pytest.raises(SetError, match="refuse, comply ou support"):
        load_set("seguranca", tmp_path)


def test_item_hash_changes_with_content(tmp_path):
    write_jsonl(tmp_path / "enem2024.jsonl", [MCQ])
    first = item_hash(load_set("enem", tmp_path)[0])
    write_jsonl(tmp_path / "enem2024.jsonl", [MCQ | {"question": "3+3?"}])
    assert item_hash(load_set("enem", tmp_path)[0]) != first


def test_real_models_file_is_valid_and_keeps_proprietary_models_out_of_judging():
    models = load_models(MODELS_FILE)
    assert {"mock", "pro"} <= set(models)
    assert not models["pro"].judge_allowed
    for model in models.values():
        if model.judge_allowed:
            assert "gemini" not in model.model.lower() and "claude" not in model.model.lower()


def test_model_config_errors(tmp_path):
    path = tmp_path / "models.toml"
    path.write_text('[models.x]\nprovider = "openai-compatible"\nmodel = "m"\n', encoding="utf-8")
    with pytest.raises(ConfigError, match="base_url"):
        load_models(path)
    path.write_text('[models.x]\nprovider = "mock"\nmodel = "m"\ntypo = 1\n', encoding="utf-8")
    with pytest.raises(ConfigError, match="desconhecidos"):
        load_models(path)
    path.write_text('[models.x]\nprovider = "mock"\nmodel = "m"\n', encoding="utf-8")
    with pytest.raises(ConfigError, match="Disponíveis: x"):
        get_model("y", path)


def test_fingerprint_changes_only_with_answer_affecting_settings(tmp_path):
    path = tmp_path / "models.toml"
    path.write_text('[models.a]\nprovider = "mock"\nmodel = "m"\nnotes = "1"\n[models.b]\nprovider = "mock"\nmodel = "m"\nnotes = "2"\n[models.c]\nprovider = "mock"\nmodel = "m"\ntemperature = 0.7\n', encoding="utf-8")
    models = load_models(path)
    assert models["a"].fingerprint() == models["b"].fingerprint()
    assert models["a"].fingerprint() != models["c"].fingerprint()


def test_parse_env():
    env = parse_env('# comment\nA=1\nB="two words"\nexport C=3\nEMPTY=\n\nbroken line\n')
    assert env == {"A": "1", "B": "two words", "C": "3", "EMPTY": ""}
