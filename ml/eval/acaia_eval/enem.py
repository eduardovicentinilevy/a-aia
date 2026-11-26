"""Converts the ENEM 2024 dataset of the GPT-4-ENEM project (MIT license) into our MCQ format.

Source: https://github.com/piresramon/gpt-4-enem (data/enem/2024.jsonl). Images are replaced by
the official textual descriptions of the accessible ("caderno laranja") booklet, so text-only
models can answer every question.
"""

from __future__ import annotations

PLACEHOLDER = "[[placeholder]]"
SOURCE_REPO = "piresramon/gpt-4-enem"
# Pinned commit, so the set never changes silently.
SOURCE_COMMIT = "cbba7fdd735845bb45ac80d5090baae1b949d782"
SOURCE_URL = f"https://raw.githubusercontent.com/{SOURCE_REPO}/{SOURCE_COMMIT}/data/enem/2024.jsonl"


def area_for(number: int) -> str:
    """ENEM order: languages 1–45, humanities 46–90, natural sciences 91–135, mathematics 136–180."""
    if number <= 45:
        return "linguagens"
    if number <= 90:
        return "ciencias-humanas"
    if number <= 135:
        return "ciencias-natureza"
    return "matematica"


def convert_row(row: dict) -> dict | None:
    """One source question → our format. None for annulled questions."""
    if row["label"] not in "ABCDE" or len(row["label"]) != 1:
        return None
    descriptions = list(row.get("description") or [])

    def fill(text: str) -> str:
        # Descriptions follow the order of the placeholders: statement first, then options A–E.
        while PLACEHOLDER in text:
            replacement = f"[{descriptions.pop(0)}]" if descriptions else "[imagem sem descrição]"
            text = text.replace(PLACEHOLDER, replacement, 1)
        return text

    question = fill(row["question"])
    options = [fill(option) for option in row["alternatives"]]
    if len(options) != 5:
        raise ValueError(f"{row['id']}: esperava 5 alternativas, veio {len(options)}")
    number = int(row["id"].split("_")[-1])
    return {
        "id": f"enem2024-q{number:03d}",
        "question": question.strip(),
        "options": [o.strip() for o in options],
        "answer": row["label"],
        "area": area_for(number),
        "source": f"ENEM 2024, questão {number} (INEP) via {SOURCE_REPO} — MIT",
    }
