from __future__ import annotations

import logging
import os
import re
from functools import lru_cache
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)

from app.schemas.learning_analysis import LearningAiRequest
from app.services.learning_analysis_prompt import (
    build_learning_analysis_input,
    build_learning_analysis_instructions,
)

logger = logging.getLogger("bilimcorp.learning_analysis.llm")

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_TIMEOUT_SECONDS = 45.0
DEFAULT_OPENAI_MAX_RETRIES = 1
DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 1200


class LearningAnalysisLlmError(RuntimeError):
    pass


def _clean_env_value(value: object, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _clean_answer_text(value: object, limit: int | None = None) -> str:
    text = str(value or "").replace("\x00", " ").strip()

    if limit:
        text = text[:limit]

    lines = [line.rstrip() for line in text.splitlines()]
    normalized = "\n".join(lines).strip()

    # Keep markdown readable, but remove excessive blank lines.
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)

    return normalized


def _get_float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw_value = _clean_env_value(os.getenv(name), 64)

    if not raw_value:
        return default

    try:
      value = float(raw_value)
    except ValueError:
        logger.warning("Invalid %s=%r. Falling back to %s.", name, raw_value, default)
        return default

    if value < minimum or value > maximum:
        logger.warning(
            "Out-of-range %s=%r. Expected %.1f..%.1f. Falling back to %.1f.",
            name,
            raw_value,
            minimum,
            maximum,
            default,
        )
        return default

    return value


def _get_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = _clean_env_value(os.getenv(name), 64)

    if not raw_value:
        return default

    try:
        value = int(raw_value)
    except ValueError:
        logger.warning("Invalid %s=%r. Falling back to %s.", name, raw_value, default)
        return default

    if value < minimum or value > maximum:
        logger.warning(
            "Out-of-range %s=%r. Expected %d..%d. Falling back to %d.",
            name,
            raw_value,
            minimum,
            maximum,
            default,
        )
        return default

    return value


def get_openai_model() -> str:
    return _clean_env_value(os.getenv("OPENAI_MODEL"), 120) or DEFAULT_OPENAI_MODEL


def get_openai_timeout_seconds() -> float:
    return _get_float_env(
        name="OPENAI_TIMEOUT_SECONDS",
        default=DEFAULT_OPENAI_TIMEOUT_SECONDS,
        minimum=5.0,
        maximum=120.0,
    )


def get_openai_max_retries() -> int:
    return _get_int_env(
        name="OPENAI_MAX_RETRIES",
        default=DEFAULT_OPENAI_MAX_RETRIES,
        minimum=0,
        maximum=5,
    )


def get_openai_max_output_tokens() -> int:
    return _get_int_env(
        name="OPENAI_MAX_OUTPUT_TOKENS",
        default=DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
        minimum=300,
        maximum=4000,
    )


def get_openai_base_url() -> str:
    return _clean_env_value(os.getenv("OPENAI_BASE_URL"), 500)


def is_learning_analysis_llm_configured() -> bool:
    return bool(_clean_env_value(os.getenv("OPENAI_API_KEY"), 4000))


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    api_key = _clean_env_value(os.getenv("OPENAI_API_KEY"), 4000)

    if not api_key:
        raise LearningAnalysisLlmError("OPENAI_API_KEY backend env ішінде көрсетілмеген.")

    base_url = get_openai_base_url()

    client_kwargs: dict[str, Any] = {
        "api_key": api_key,
        "timeout": get_openai_timeout_seconds(),
        "max_retries": get_openai_max_retries(),
    }

    if base_url:
        client_kwargs["base_url"] = base_url

    return AsyncOpenAI(**client_kwargs)


def _extract_output_text(response: object) -> str:
    output_text = getattr(response, "output_text", None)

    if isinstance(output_text, str) and output_text.strip():
        return _clean_answer_text(output_text, 12000)

    # Defensive fallback for SDK/response variations.
    chunks: list[str] = []
    output_items = getattr(response, "output", None)

    if isinstance(output_items, list):
        for item in output_items:
            content_items = getattr(item, "content", None)

            if not isinstance(content_items, list):
                continue

            for content in content_items:
                text = getattr(content, "text", None)

                if isinstance(text, str) and text.strip():
                    chunks.append(text)

    return _clean_answer_text("\n".join(chunks), 12000)


def _map_openai_error(exc: Exception) -> str:
    if isinstance(exc, AuthenticationError):
        return "OpenAI API key қабылданбады. Backend env ішіндегі OPENAI_API_KEY мәнін тексеріңіз."

    if isinstance(exc, PermissionDeniedError):
        return "OpenAI API бұл model немесе project үшін рұқсат бермеді. OPENAI_MODEL және API project permissions тексерілуі керек."

    if isinstance(exc, RateLimitError):
        return "OpenAI rate limit немесе quota шектеуі іске қосылды. Біраздан кейін қайталап көріңіз немесе usage limits тексеріңіз."

    if isinstance(exc, BadRequestError):
        return "OpenAI сұраныс форматын қабылдамады. OPENAI_MODEL Responses API-мен жұмыс істейтінін және prompt өлшемін тексеріңіз."

    if isinstance(exc, APITimeoutError):
        return "OpenAI сұранысы timeout болды. OPENAI_TIMEOUT_SECONDS мәнін немесе context көлемін тексеріңіз."

    if isinstance(exc, APIConnectionError):
        return "OpenAI API-ға қосылу мүмкін болмады. Backend network, OPENAI_BASE_URL немесе outbound connection тексерілуі керек."

    if isinstance(exc, APIStatusError):
        return f"OpenAI API status қатесі: {exc.status_code}."

    return "AI model сұранысын орындау мүмкін болмады."


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
        response = await client.responses.create(
            model=model,
            instructions=instructions,
            input=user_input,
            max_output_tokens=get_openai_max_output_tokens(),
        )
    except (
        AuthenticationError,
        PermissionDeniedError,
        RateLimitError,
        BadRequestError,
        APITimeoutError,
        APIConnectionError,
        APIStatusError,
    ) as exc:
        logger.warning(
            "OpenAI learning analysis request failed: %s",
            exc.__class__.__name__,
        )
        raise LearningAnalysisLlmError(_map_openai_error(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected OpenAI learning analysis request failure")
        raise LearningAnalysisLlmError("AI model сұранысын орындау мүмкін болмады.") from exc

    answer = _extract_output_text(response)

    if not answer:
        raise LearningAnalysisLlmError("AI model бос жауап қайтарды.")

    return answer