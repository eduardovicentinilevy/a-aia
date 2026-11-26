"""Model registry (ml/eval/models.toml)."""

from __future__ import annotations

import hashlib
import json
import tomllib
from dataclasses import asdict, dataclass
from pathlib import Path

from .paths import MODELS_FILE


class ConfigError(Exception):
    """Invalid or missing model configuration (message is shown to the user, in PT-BR)."""


@dataclass(frozen=True)
class ModelConfig:
    name: str
    provider: str  # "openai-compatible" | "mock"
    model: str
    base_url: str | None = None
    api_key_env: str | None = None
    temperature: float = 0.0
    max_tokens: int = 1024
    requests_per_minute: float | None = None
    timeout_s: float = 120.0
    # Extra fields merged into the request body, e.g. to turn off "thinking" in Qwen models:
    # extra_body = { chat_template_kwargs = { enable_thinking = false } }
    extra_body: dict | None = None
    # Only models whose license/terms allow using their outputs to develop other models
    # may act as judges (docs/DECISIONS.md D-023).
    judge_allowed: bool = False
    license: str = ""
    notes: str = ""

    def fingerprint(self) -> str:
        """Changes whenever a setting that affects the answers changes (invalidates cached answers)."""
        relevant = {k: v for k, v in asdict(self).items() if k in {"provider", "model", "base_url", "temperature", "max_tokens", "extra_body"}}
        return hashlib.sha256(json.dumps(relevant, sort_keys=True).encode()).hexdigest()[:16]


_ALLOWED_KEYS = set(ModelConfig.__dataclass_fields__) - {"name"}


def load_models(path: Path = MODELS_FILE) -> dict[str, ModelConfig]:
    with path.open("rb") as file:
        data = tomllib.load(file)
    models: dict[str, ModelConfig] = {}
    for name, values in data.get("models", {}).items():
        unknown = set(values) - _ALLOWED_KEYS
        if unknown:
            raise ConfigError(f"models.toml [{name}]: campos desconhecidos {sorted(unknown)}")
        if values.get("provider") not in {"openai-compatible", "mock"}:
            raise ConfigError(f"models.toml [{name}]: provider deve ser 'openai-compatible' ou 'mock'")
        if values["provider"] == "openai-compatible" and not values.get("base_url"):
            raise ConfigError(f"models.toml [{name}]: base_url é obrigatório para openai-compatible")
        if "extra_body" in values and not isinstance(values["extra_body"], dict):
            raise ConfigError(f"models.toml [{name}]: extra_body deve ser uma tabela, ex.: {{ chave = valor }}")
        if "model" not in values:
            raise ConfigError(f"models.toml [{name}]: campo 'model' é obrigatório")
        models[name] = ModelConfig(name=name, **values)
    return models


def get_model(name: str, path: Path = MODELS_FILE) -> ModelConfig:
    models = load_models(path)
    if name not in models:
        raise ConfigError(f"Modelo '{name}' não está em {path.name}. Disponíveis: {', '.join(sorted(models))}")
    return models[name]
