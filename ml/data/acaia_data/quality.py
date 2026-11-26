"""Text normalization, de-duplication and decontamination (no eval question may leak into training)."""

from __future__ import annotations

import re
import unicodedata


def normalize(text: str) -> str:
    """Lowercase, no accents, no punctuation, single spaces."""
    stripped = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", stripped)).strip()


def ngrams(text: str, n: int) -> set[tuple[str, ...]]:
    words = normalize(text).split()
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


class Decontaminator:
    """Flags training text that shares a long word sequence with any evaluation text.

    Long texts (ENEM questions) are matched by any shared n-gram of `n` words; short ones
    (a 6-word instruction) by exact normalized match, since they have no n-gram of that size.
    """

    def __init__(self, eval_texts: list[str], n: int = 8):
        self.n = n
        self.grams: set[tuple[str, ...]] = set()
        self.exact: set[str] = set()
        for text in eval_texts:
            normalized = normalize(text)
            if not normalized:
                continue
            self.exact.add(normalized)
            self.grams |= ngrams(text, n)

    def is_contaminated(self, text: str) -> bool:
        return normalize(text) in self.exact or not self.grams.isdisjoint(ngrams(text, self.n))


def dedup_key(messages: list[dict]) -> str:
    """Two examples are duplicates when their first user message is the same (after normalizing)."""
    first_user = next((m["content"] for m in messages if m["role"] == "user"), "")
    return normalize(first_user)
