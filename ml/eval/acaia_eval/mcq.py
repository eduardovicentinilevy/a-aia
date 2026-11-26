"""Multiple-choice questions: prompt format and answer extraction."""

from __future__ import annotations

import re

from .sets import LETTERS, McqItem

INSTRUCTION = "Pense com calma, mas seja breve. Na última linha, escreva apenas: Resposta: <letra>"


def format_prompt(item: McqItem) -> str:
    options = "\n".join(f"{letter}) {text}" for letter, text in zip(LETTERS, item.options))
    return f"Responda à questão de múltipla escolha a seguir.\n\n{item.question}\n\n{options}\n\n{INSTRUCTION}"


# From most to least explicit. The LAST match wins: models often discuss several options first.
# Keywords are case-insensitive, but the LETTER must be uppercase — otherwise the Portuguese
# article "a" in "a resposta é a letra D" would be read as option A.
_LETTER = r"\**\(?([A-E])\)?\**(?![A-Za-zÀ-ÿ])"
_FILLER = r"(?:(?i:a|o)\s+)?(?:(?i:letra|alternativa|opção|opcao)\s+)?"
_PATTERNS = [
    re.compile(r"(?i:resposta(?:\s+final|\s+correta)?)\s*(?:é|:|：|-|–|=)?\s*" + _FILLER + _LETTER),
    re.compile(r"(?i:alternativa|letra|opção|opcao)\s+(?:(?i:correta)\s+)?(?:(?i:é)\s+)?(?:(?i:a)\s+)?" + _LETTER),
    re.compile(r"^\s*" + _LETTER + r"[.)]?\s*$", re.MULTILINE),
]


def extract_choice(text: str) -> str | None:
    """The letter the model chose, or None when it cannot be determined (counts as wrong)."""
    for pattern in _PATTERNS:
        matches = pattern.findall(text)
        if matches:
            return matches[-1].upper()
    return None
