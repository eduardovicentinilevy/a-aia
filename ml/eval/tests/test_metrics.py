import pytest

from acaia_eval.metrics import Rate, acaia_score, agreement, mcq_summary, rubric_summary, safety_summary, wilson_interval


def test_wilson_interval_known_values():
    low, high = wilson_interval(50, 100)
    assert low == pytest.approx(0.4038, abs=1e-3)
    assert high == pytest.approx(0.5962, abs=1e-3)
    # Never outside [0, 1], even at the edges.
    assert wilson_interval(0, 10)[0] == 0.0
    assert wilson_interval(10, 10)[1] == 1.0
    assert wilson_interval(0, 0) is None


def test_about_180_questions_give_roughly_plus_minus_7_points():
    low, high = wilson_interval(90, 179)
    assert (high - low) / 2 == pytest.approx(0.072, abs=0.005)


def test_mcq_summary():
    records = [
        {"correct": True, "choice": "A", "area": "matematica"},
        {"correct": False, "choice": None, "area": "matematica"},
        {"correct": True, "choice": "B", "area": "linguagens"},
    ]
    summary = mcq_summary(records)
    assert summary["accuracy"] == Rate(2, 3)
    assert summary["invalid"] == 1
    assert summary["by_area"]["matematica"] == Rate(1, 2)


def test_safety_summary_separates_the_two_failure_modes():
    records = [
        {"expected": "refuse", "label": "refuse", "correct": True, "category": "armas"},
        {"expected": "refuse", "label": "comply", "correct": False, "category": "armas"},
        {"expected": "comply", "label": "refuse", "correct": False, "category": "golpes"},
        {"expected": "comply", "label": "comply", "correct": True, "category": "golpes"},
        {"expected": "support", "label": "support", "correct": True, "category": "autolesao"},
    ]
    s = safety_summary(records)
    assert s["correct_refusal"] == Rate(1, 2)
    assert s["over_refusal"] == Rate(1, 2)
    assert s["support"] == Rate(1, 1)
    assert s["overall"] == Rate(3, 5)


def test_rubric_summary_maps_1_to_0_and_5_to_100():
    perfect = {c: 5 for c in ("correcao", "utilidade", "portugues", "tom", "concisao")}
    worst = {c: 1 for c in perfect}
    assert rubric_summary([perfect])["score"] == 100
    assert rubric_summary([worst])["score"] == 0
    assert rubric_summary([perfect, worst])["score"] == 50
    assert rubric_summary([])["score"] is None


def test_agreement_and_acaia_score():
    result = agreement([(4, 4.5), (2, 4), (5, 5)])
    assert result["n"] == 3
    assert result["within_one"] == Rate(2, 3)
    assert acaia_score(60, 70, 80) == 70
    assert acaia_score(60, None, 80) is None
