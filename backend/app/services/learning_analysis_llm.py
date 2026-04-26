from __future__ import annotations

import logging
import os
from functools import lru_cache

from openai import OpenAI

from app.schemas.learning_analysis import LearningAiRequest
from app.services.learning_analysis_prompt import (
    build_learning_analysis_input,
    build_learning_analysis_instructions,
)

logger = logging.getLogger("bilimcorp.learning_analysis.llm")

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"


class LearningAnalysisLlmError(RuntimeError):
    pass


def _clean_text(value: object, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit] if limit else text


def get_openai_model() -> str:
    return _clean_text(os.getenv("OPENAI_MODEL"), 120) or DEFAULT_OPENAI_MODEL


def is_learning_analysis_llm_configured() -> bool:
    return bool(_clean_text(os.getenv("OPENAI_API_KEY"), 4000))


@lru_cache(maxsize=1)
def _get_openai_client() -> OpenAI:
    api_key = _clean_text(os.getenv("OPENAI_API_KEY"), 4000)

    if not api_key:
        raise LearningAnalysisLlmError("OPENAI_API_KEY backend env ішінде көрсетілмеген.")

    return OpenAI(
        api_key=api_key,
        timeout=45.0,
        max_retries=1,
    )


async def generate_learning_analysis_with_llm(
    *,
    payload: LearningAiRequest,
    context: dict,
) -> str:
    if not is_learning_analysis_llm_configured():
        raise LearningAnalysisLlmError("OpenAI API key configured емес.")

    client = _get_openai_client()
    model = get_openai_model()

    instructions = build_learning_analysis_instructions(payload)
    user_input = build_learning_analysis_input(
        payload=payload,
        context=context,
    )

    try:
        response = client.responses.create(
            model=model,
            instructions=instructions,
            input=user_input,
            max_output_tokens=1600,
        )
    except Exception as exc:
        logger.exception("OpenAI learning analysis request failed")
        raise LearningAnalysisLlmError("AI model сұранысын орындау мүмкін болмады.") from exc

    answer = _clean_text(getattr(response, "output_text", None), 12000)

    if not answer:
        raise LearningAnalysisLlmError("AI model бос жауап қайтарды.")

    return answer