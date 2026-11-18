"""Генерация промпттарының қоймасы (bagalau-zhuiesi.md §2.2, §3.2).

Промпттар `templates/*.md` файлдарында тұрады, әр файлдың басында `version:` бар. Пакетке
жазылатын `prompt_version` — жүйелік промпт пен формат ережесінің нұсқалары.

Хабарламалардың реті prompt caching-ке сай (ortaq §2.2): өзгермейтін жүйелік бөлік →
формат ережесі → оқулық үзіндісі → нақты тапсырма.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from ...llm_gateway import Message, PromptRef, wrap_untrusted

PROMPT_DIR = Path(__file__).with_name("templates")
_FRONT_MATTER = re.compile(r"\A---\s*\nversion:\s*(?P<version>\S+)\s*\n---\s*\n", re.MULTILINE)

LEVEL_NAMES = {1: "1 · Білу", 2: "2 · Қолдану", 3: "3 · Пайымдау", 4: "4 · Қолдану + Пайымдау"}


@dataclass(frozen=True)
class PromptText:
    version: str
    body: str


@lru_cache(maxsize=None)
def load_prompt(name: str) -> PromptText:
    text = (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")
    match = _FRONT_MATTER.match(text)
    if match is None:
        raise ValueError(f"templates/{name}.md: басында 'version:' жоқ")
    return PromptText(version=match["version"], body=text[match.end():].strip())


def generation_prompt_ref(format_name: str) -> PromptRef:
    system = load_prompt("system")
    rules = load_prompt(format_name)
    return PromptRef(f"examiner.generation.{format_name}", f"{system.version}+{rules.version}")


@dataclass(frozen=True)
class GenerationTask:
    format: str
    level: int
    tier: str
    book_title: str
    paragraph_no: str
    paragraph_title: str | None


def generation_messages(task: GenerationTask, reference: str) -> list[Message]:
    system = load_prompt("system").body
    rules = load_prompt(task.format).body
    title = f"§{task.paragraph_no}" + (f". {task.paragraph_title}" if task.paragraph_title else "")
    request = {
        "оқулық": task.book_title,
        "тақырып": title,
        "деңгей": LEVEL_NAMES[task.level],
        "санат": task.tier,
    }
    return [
        Message("system", system),
        Message("system", rules),
        Message("user", wrap_untrusted(reference, "textbook")),
        Message("user", "Тапсырма:\n" + json.dumps(request, ensure_ascii=False, indent=1)),
    ]
