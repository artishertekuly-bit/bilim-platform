"""Банк аудиті: белсенді сұрақтарды генерациядағы Т6/Т7 тексерістерімен қайта тексереді (D73).

Тексеріс ережелері кейін қатайса (мысалы, D72-дегі тесттің сыртқы белгілері), бұрын қабылданған
сұрақтар ескі ережемен банкте қалады. Аудит оларды қазіргі кодпен қайта өлшейді:
  * Т6 және детерминистік Т7 — пакеттен қайта құрылған генератор моделінің `problems()`-і;
  * дәйексөз — сақталған `reference_context` мәтінінде бар ма (Т7);
  * қайталау — бір § пен деңгейдегі белсенді сұрақтар арасында ≥ DUPLICATE_THRESHOLD (Т7):
    ертерек жасалғаны қалады, кейінгісі белгіленеді.
MCQ-дің шешуші тексерісі (LLM) қайталанбайды: ол генерацияда сол модельмен өткен.

Белгіленген сұрақ өшірілмейді: `question_state.status = 'retired'`, себебі тарихқа жазылады
(`question_state_history`), сондықтан оны қайта белсенді етуге болады.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from pydantic import ValidationError

from .checks import DUPLICATE_THRESHOLD, cosine, quote_problem
from .formats import Package, gen_from_package


@dataclass(frozen=True)
class BankQuestion:
    question_id: str
    topic_id: str
    level: int
    format: str
    x_tier: str
    created_at: datetime
    content: dict[str, Any]
    key: dict[str, Any]
    ecd_skill: str
    evidence: str
    support_quote: str
    reference_text: str
    embedding: list[float] | None


@dataclass(frozen=True)
class Finding:
    question: BankQuestion
    reasons: tuple[str, ...]


def question_problems(question: BankQuestion) -> list[str]:
    try:
        generated = gen_from_package(
            question.format, question.content, question.key, ecd_skill=question.ecd_skill,
            evidence=question.evidence, support_quote=question.support_quote,
        )
    except (KeyError, ValueError, ValidationError, TypeError) as exc:
        return [f"Т6: пакет құрылымы оқылмады ({type(exc).__name__})"]
    problems = generated.problems()
    if question.reference_text:
        package = Package(format=question.format, content=question.content, key=question.key,
                          ecd_skill=question.ecd_skill, evidence=question.evidence,
                          support_quote=question.support_quote)
        quote = quote_problem(package, question.reference_text)
        if quote:
            problems.append(quote)
    else:
        problems.append("Т7: reference_context мәтіні сақталмаған")
    return problems


def audit(questions: Sequence[BankQuestion]) -> list[Finding]:
    """Белгіленген сұрақтар және себептері. Қайталау тексерісінде алдымен белгіленбегендер ескеріледі."""
    reasons: dict[str, list[str]] = {q.question_id: question_problems(q) for q in questions}
    kept: dict[tuple[str, int], list[BankQuestion]] = {}
    for question in sorted(questions, key=lambda q: (q.created_at, q.question_id)):
        if reasons[question.question_id] or question.embedding is None:
            continue
        group = kept.setdefault((question.topic_id, question.level), [])
        best = max((cosine(question.embedding, other.embedding) for other in group if other.embedding), default=0.0)
        if best >= DUPLICATE_THRESHOLD:
            reasons[question.question_id].append(f"Т7: бар сұраққа тым ұқсас ({best:.2f})")
        else:
            group.append(question)
    return [Finding(q, tuple(reasons[q.question_id])) for q in questions if reasons[q.question_id]]
