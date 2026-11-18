"""Хабарламаларды тексеру және оқушы мәтінін қауіпсіз орау."""

from __future__ import annotations

import math
import re
from collections.abc import Sequence

from .contracts import Message


def validate_messages(messages: Sequence[Message]) -> None:
    """Жүйелік хабарламалар басында тұруы керек: промпттың өзгермейтін бөлігі алда,
    оқушы жауабы соңында болғанда провайдердің префикс кэші жұмыс істейді (ortaq §2.2)."""
    if not messages:
        raise ValueError("Хабарламалар тізімі бос")
    seen_non_system = False
    for message in messages:
        if message.role not in ("system", "user", "assistant"):
            raise ValueError(f"Белгісіз рөл: {message.role}")
        if not message.content.strip():
            raise ValueError("Бос хабарлама жіберілмейді")
        if message.role == "system":
            if seen_non_system:
                raise ValueError("Жүйелік хабарлама басқа хабарламалардан кейін тұр")
        else:
            seen_non_system = True
    if not seen_non_system:
        raise ValueError("Кемінде бір user немесе assistant хабарламасы керек")


def estimate_tokens(messages: Sequence[Message], chars_per_token: float) -> int:
    """Лимит үшін алдын ала болжам. Нақты мән жауаптан кейін түзетіледі."""
    chars = sum(len(message.content) for message in messages)
    return math.ceil(chars / chars_per_token) + 4 * len(messages)


def wrap_untrusted(text: str, tag: str = "student_answer") -> str:
    """Оқушы мәтінін шектеуіштің ішіне салады (examiner §7.1).

    Мәтін ішінде сол тег кездессе, оның алдына көрінбейтін бос орын қойылады:
    оқушы шектеуішті жауып, нұсқау қоса алмайды. Қалған мәтін өзгермейді,
    сондықтан дәйексөздерді тексеру (bagalau Т9) бұзылмайды.
    """
    if not re.fullmatch(r"[a-z_]+", tag):
        raise ValueError("Тег тек кіші латын әріптері мен _ болуы керек")
    pattern = re.compile(rf"<\s*(/?)\s*{tag}", re.IGNORECASE)
    safe = pattern.sub(lambda m: f"<{m.group(1)}​{tag}", text)
    return f"<{tag}>\n{safe}\n</{tag}>"


def strip_json_fence(text: str) -> str:
    """Кейбір модельдер JSON-ды ```json ... ``` ішіне орайды."""
    stripped = text.strip()
    match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL)
    return match.group(1) if match else stripped
