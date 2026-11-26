import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from acaia_eval.client import ModelError, OpenAICompatibleClient
from acaia_eval.config import ModelConfig


class FakeProvider:
    """A local HTTP server that answers with a scripted list of (status, body, headers)."""

    def __init__(self, script):
        self.script = list(script)
        self.requests = []
        provider = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                provider.requests.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
                status, payload, headers = provider.script.pop(0) if provider.script else (500, {"error": {"message": "fim do roteiro"}}, {})
                raw = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                for key, value in headers.items():
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}/v1"

    def close(self):
        self.server.shutdown()


OK = {"choices": [{"message": {"content": "Resposta: B"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 50, "completion_tokens": 3}}


@pytest.fixture(autouse=True)
def no_proxy(monkeypatch):
    # The fake provider is local: never route it through a corporate/sandbox proxy.
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")


def make_client(provider, **overrides):
    config = ModelConfig(name="t", provider="openai-compatible", model="m1", base_url=provider.base_url, **overrides)
    sleeps = []
    client = OpenAICompatibleClient(config, api_key="segredo", sleep=sleeps.append)
    return client, sleeps


def test_sends_the_request_and_parses_the_answer():
    provider = FakeProvider([(200, OK, {})])
    try:
        client, _ = make_client(provider, temperature=0.0, max_tokens=64)
        completion = client.complete([{"role": "user", "content": "oi"}])
    finally:
        provider.close()
    assert completion.text == "Resposta: B"
    assert (completion.tokens_in, completion.tokens_out, completion.finish_reason) == (50, 3, "stop")
    request = provider.requests[0]
    assert request["path"] == "/v1/chat/completions"
    assert request["auth"] == "Bearer segredo"
    assert request["body"] == {"model": "m1", "messages": [{"role": "user", "content": "oi"}], "temperature": 0.0, "max_tokens": 64, "stream": False}


def test_retries_429_honoring_retry_after():
    provider = FakeProvider([(429, {"error": {"message": "quota"}}, {"Retry-After": "7"}), (200, OK, {})])
    try:
        client, sleeps = make_client(provider)
        assert client.complete([{"role": "user", "content": "oi"}]).text == "Resposta: B"
    finally:
        provider.close()
    assert sleeps == [7.0]


def test_does_not_retry_client_errors():
    provider = FakeProvider([(400, [{"error": {"message": "modelo inválido"}}], {}), (200, OK, {})])
    try:
        client, sleeps = make_client(provider)
        with pytest.raises(ModelError, match="HTTP 400: modelo inválido") as info:
            client.complete([{"role": "user", "content": "oi"}])
    finally:
        provider.close()
    assert info.value.status == 400 and not info.value.quota
    assert sleeps == [] and len(provider.requests) == 1


def test_persistent_429_is_reported_as_quota_after_backoff():
    provider = FakeProvider([(429, {"error": {"message": "quota"}}, {})] * 5)
    try:
        client, sleeps = make_client(provider)
        with pytest.raises(ModelError) as info:
            client.complete([{"role": "user", "content": "oi"}])
    finally:
        provider.close()
    assert info.value.quota
    assert sleeps == [2.0, 4.0, 8.0, 16.0]  # exponential backoff between the 5 attempts


def test_paces_requests_per_minute():
    provider = FakeProvider([(200, OK, {}), (200, OK, {})])
    try:
        client, sleeps = make_client(provider, requests_per_minute=30)  # one every 2 s
        client.clock = iter([100.0, 100.1, 100.5, 102.0, 102.1]).__next__  # start, end, pace check, start, end
        client.complete([{"role": "user", "content": "1"}])
        client.complete([{"role": "user", "content": "2"}])
    finally:
        provider.close()
    assert sleeps == [pytest.approx(1.5)]  # 2 s interval − 0.5 s already elapsed
