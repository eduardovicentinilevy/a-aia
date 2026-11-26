"""Text helpers shared by scoring and judging."""

import re

_THINK = re.compile(r"<think>.*?(</think>|$)", re.DOTALL | re.IGNORECASE)


def strip_reasoning(text: str) -> str:
    """Removes <think>…</think> blocks that reasoning models (e.g. Qwen3) emit before the answer.
    An unclosed block (answer cut by max_tokens) is removed until the end."""
    return _THINK.sub("", text).strip()
