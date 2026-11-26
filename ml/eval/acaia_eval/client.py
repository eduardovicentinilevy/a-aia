"""Chat clients: any OpenAI-compatible endpoint (Gemini, vLLM, Ollama) and an offline mock.

Evaluation does not need streaming, so requests are plain `POST /chat/completions`.
Free tiers have tight limits, so the client paces requests and retries with backoff.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

from .config import ModelConfig

Message = dict[str, str]
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


class ModelError(Exception):
    """A request that failed for good (after retries)."""

    def __init__(self, message: str, *, status: int | None = None, quota: bool = False):
        super().__init__(message)
        self.status = status
        # True when the provider keeps answering 429: stop the run, progress is saved.
        self.quota = quota


@dataclass
class Completion:
    text: str
    latency_ms: int
    tokens_in: int | None = None
    tokens_out: int | None = None
    finish_reason: str | None = None


@dataclass
class OpenAICompatibleClient:
    config: ModelConfig
    api_key: str | None
    max_attempts: int = 5
    backoff_base_s: float = 2.0
    sleep: Callable[[float], None] = time.sleep
    clock: Callable[[], float] = time.monotonic
    _last_request_at: float | None = field(default=None, init=False)

    def _pace(self) -> None:
        """Waits so we never exceed `requests_per_minute`."""
        rpm = self.config.requests_per_minute
        if not rpm or self._last_request_at is None:
            return
        wait = 60.0 / rpm - (self.clock() - self._last_request_at)
        if wait > 0:
            self.sleep(wait)

    def _post(self, body: dict) -> dict:
        url = f"{(self.config.base_url or '').rstrip('/')}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
        with urllib.request.urlopen(request, timeout=self.config.timeout_s) as response:
            return json.loads(response.read().decode())

    def complete(self, messages: list[Message]) -> Completion:
        body = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": False,
        }
        last_error: ModelError | None = None
        for attempt in range(self.max_attempts):
            self._pace()
            started = self.clock()
            self._last_request_at = started
            retry_after: float | None = None
            try:
                data = self._post(body)
            except urllib.error.HTTPError as err:
                detail = _error_detail(err)
                last_error = ModelError(f"HTTP {err.code}: {detail}", status=err.code, quota=err.code == 429)
                if err.code not in RETRYABLE_STATUS:
                    raise last_error from None
                retry_after = _retry_after_seconds(err.headers.get("Retry-After"))
            except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
                last_error = ModelError(f"Erro de rede: {getattr(err, 'reason', err)}")
            else:
                return _parse_completion(data, latency_ms=round((self.clock() - started) * 1000))
            if attempt < self.max_attempts - 1:
                self.sleep(retry_after if retry_after is not None else self.backoff_base_s * 2**attempt)
        assert last_error is not None
        raise last_error


def _parse_completion(data: dict, *, latency_ms: int) -> Completion:
    try:
        choice = data["choices"][0]
        text = choice["message"].get("content") or ""
    except (KeyError, IndexError, TypeError) as err:
        raise ModelError(f"Resposta inesperada do provedor: {str(data)[:200]}") from err
    usage = data.get("usage") or {}
    return Completion(
        text=text,
        latency_ms=latency_ms,
        tokens_in=usage.get("prompt_tokens"),
        tokens_out=usage.get("completion_tokens"),
        finish_reason=choice.get("finish_reason"),
    )


def _error_detail(err: urllib.error.HTTPError) -> str:
    try:
        raw = err.read().decode(errors="replace")[:2000]
        parsed = json.loads(raw)
        body = parsed[0] if isinstance(parsed, list) else parsed
        return str(body.get("error", {}).get("message", raw))[:300]
    except Exception:  # noqa: BLE001 — best effort, only for the error message
        return err.reason if isinstance(err.reason, str) else "sem detalhes"


def _retry_after_seconds(value: str | None) -> float | None:
    try:
        return max(0.0, float(value)) if value is not None else None
    except ValueError:
        return None


@dataclass
class MockClient:
    """Offline, deterministic stand-in to test the harness end to end without any API."""

    config: ModelConfig

    def complete(self, messages: list[Message]) -> Completion:
        prompt = messages[-1]["content"].lower()
        if "resposta: <letra>" in prompt:
            text = "Analisando as alternativas, a mais adequada é a C.\nResposta: C"
        elif any(word in prompt for word in ("bomba", "explosivo", "metanfetamina", "invadir")):
            text = "Não posso ajudar com isso, porque pode causar dano real."
        elif any(word in prompt for word in ("me matar", "me machucar", "suicídio", "suicidio")):
            text = "Sinto muito que você esteja passando por isso. Ligue 188 (CVV), é gratuito e funciona 24 horas."
        else:
            text = "Claro! Aqui vai uma resposta de teste do modelo mock."
        return Completion(text=text, latency_ms=1, tokens_in=len(prompt) // 4, tokens_out=len(text) // 4, finish_reason="stop")


def make_client(config: ModelConfig, env: dict[str, str]):
    if config.provider == "mock":
        return MockClient(config)
    api_key = env.get(config.api_key_env) if config.api_key_env else None
    if config.api_key_env and not api_key:
        from .config import ConfigError

        raise ConfigError(f"Defina {config.api_key_env} no .env (ou no ambiente) para usar o modelo '{config.name}'.")
    return OpenAICompatibleClient(config, api_key)
