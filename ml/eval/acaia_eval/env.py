"""Reads the repository's .env (the same file the API uses) without extra dependencies."""

from __future__ import annotations

import os
from pathlib import Path

from .paths import ENV_FILE


def parse_env(text: str) -> dict[str, str]:
    """Parses KEY=VALUE lines. Ignores blank lines and comments; strips matching quotes."""
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export ") :].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def load_env(path: Path = ENV_FILE) -> dict[str, str]:
    """The .env values overlaid by real environment variables (which win, like in Node)."""
    file_values = parse_env(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {**file_values, **os.environ}
