from __future__ import annotations

import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
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

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = Path(__file__).resolve().parents[2]

# Load env defensively for direct service execution/tests. Existing process env wins.
for env_file in (ROOT_DIR / ".env", BACKEND_DIR / ".env"):
    if env_file.exists():
        load_dotenv(env_file, override=False)

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_TIMEOUT_SECONDS = 45.0
DEFAULT_OPENAI_MAX_RETRIES = 1
DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 1200
DEFAULT_OPENAI_TEMPERATURE = 0.2

MAX_API_KEY_LENGTH = 5000
MAX_BASE_URL_LENGTH = 500
MAX_MODEL_NAME_LENGTH = 120
MAX_ANSWER_LENGTH = 12000

_PLACEHOLDER_API_KEYS = {
    "",
    "your_openai_api_key_here",
    "your-api-key",
    "your_api_key",
    "openai_api_key_here",
    "sk-xxx",
    "sk-...",
    "changeme",
    "change_me",
    "none",
    "null",
    "undefined",
}


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

    # Keep markdown readable, but collapse excessive empty space.
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)

    return normalized


def _get_float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw_value = _clean_env_value(os.getenv(name), 64)

    if not raw_value:
        return default

    try:
        value = float(raw_value)
    except ValueError:
        logger.warning("Invalid %s value. Falling back to %.2f.", name, default)
        return default

    if value < minimum or value > maximum:
        logger.warning(
            "Out-of-range %s value. Expected %.1f..%.1f. Falling back to %.1f.",
            name,
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
        logger.warning("Invalid %s value. Falling back to %d.", name, default)
        return default

    if value < minimum or value > maximum:
        logger.warning(
            "Out-of-range %s value. Expected %d..%d. Falling back to %d.",
            name,
            minimum,
            maximum,
            default,
        )
        return default

    return value


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_placeholder_api_key(value: str) -> bool:
    return value.strip().lower() in _PLACEHOLDER_API_KEYS


def get_openai_model() -> str:
    return _clean_env_value(os.getenv("OPENAI_MODEL"), MAX_MODEL_NAME_LENGTH) or DEFAULT_OPENAI_MODEL


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


def get_openai_temperature() -> float:
    return _get_float_env(
        name="OPENAI_TEMPERATURE",
        default=DEFAULT_OPENAI_TEMPERATURE,
        minimum=0.0,
        maximum=2.0,
    )


def get_openai_base_url() -> str:
    return _clean_env_value(os.getenv("OPENAI_BASE_URL"), MAX_BASE_URL_LENGTH)


def _get_openai_api_key() -> str:
    return _clean_env_value(os.getenv("OPENAI_API_KEY"), MAX_API_KEY_LENGTH)


def is_learning_analysis_llm_configured() -> bool:
    api_key = _get_openai_api_key()

    if not api_key:
        return False

    # Custom OpenAI-compatible gateways sometimes use a dummy key. Keep those valid
    # only when an explicit custom base URL is configured.
    if _is_placeholder_api_key(api_key) and not get_openai_base_url():
        return False

    return True


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    api_key = _get_openai_api_key()

    if not api_key:
        raise LearningAnalysisLlmError("OPENAI_API_KEY backend env ішінде көрсетілмеген.")

    if _is_placeholder_api_key(api_key) and not get_openai_base_url():
        raise LearningAnalysisLlmError(
            "OPENAI_API_KEY placeholder сияқты көрінеді. Backend env ішіне нақты API key қойыңыз."
        )

    client_kwargs: dict[str, Any] = {
        "api_key": api_key,
        "timeout": get_openai_timeout_seconds(),
        "max_retries": get_openai_max_retries(),
    }

    base_url = get_openai_base_url()
    if base_url:
        client_kwargs["base_url"] = base_url

    return AsyncOpenAI(**client_kwargs)


def _extract_text_from_content_part(content: Any) -> str:
    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str):
            return text

        nested_text = content.get("content")
        if isinstance(nested_text, str):
            return nested_text

        return ""

    text = getattr(content, "text", None)
    if isinstance(text, str):
        return text

    nested_text = getattr(content, "content", None)
    if isinstance(nested_text, str):
        return nested_text

    return ""


def _extract_output_text(response: object) -> str:
    output_text = getattr(response, "output_text", None)

    if isinstance(output_text, str) and output_text.strip():
        return _clean_answer_text(output_text, MAX_ANSWER_LENGTH)

    chunks: list[str] = []
    output_items = getattr(response, "output", None)

    if isinstance(output_items, list):
        for item in output_items:
            content_items = item.get("content") if isinstance(item, dict) else getattr(item, "content", None)

            if not isinstance(content_items, list):
                continue

            for content in content_items:
                text = _extract_text_from_content_part(content)
                if text.strip():
                    chunks.append(text)

    return _clean_answer_text("\n".join(chunks), MAX_ANSWER_LENGTH)


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


async def _create_response(
    *,
    client: AsyncOpenAI,
    model: str,
    instructions: str,
    user_input: str,
) -> object:
    request_kwargs: dict[str, Any] = {
        "model": model,
        "instructions": instructions,
        "input": user_input,
        "max_output_tokens": get_openai_max_output_tokens(),
    }

    # Some OpenAI-compatible providers reject temperature for specific models.
    # Keep this enabled by default for OpenAI, but allow disabling without code changes.
    if not _is_truthy(os.getenv("OPENAI_DISABLE_TEMPERATURE")):
        request_kwargs["temperature"] = get_openai_temperature()

    return await client.responses.create(**request_kwargs)


async def _create_chat_completion_fallback(
    *,
    client: AsyncOpenAI,
    model: str,
    instructions: str,
    user_input: str,
) -> str:
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": instructions},
            {"role": "user", "content": user_input},
        ],
        max_tokens=get_openai_max_output_tokens(),
        temperature=get_openai_temperature(),
    )

    content = response.choices[0].message.content if response.choices else ""
    return _clean_answer_text(content, MAX_ANSWER_LENGTH)


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
        response = await _create_response(
            client=client,
            model=model,
            instructions=instructions,
            user_input=user_input,
        )
        answer = _extract_output_text(response)
    except BadRequestError as exc:
        # Optional compatibility mode for OpenAI-compatible gateways that do not
        # implement Responses API. Disabled by default to avoid hiding real schema bugs.
        if not _is_truthy(os.getenv("OPENAI_ENABLE_CHAT_COMPLETIONS_FALLBACK")):
            logger.warning("OpenAI Responses request failed: %s", exc.__class__.__name__)
            raise LearningAnalysisLlmError(_map_openai_error(exc)) from exc

        logger.warning(
            "Responses API request failed; trying Chat Completions fallback: %s",
            exc.__class__.__name__,
        )
        try:
            answer = await _create_chat_completion_fallback(
                client=client,
                model=model,
                instructions=instructions,
                user_input=user_input,
            )
        except Exception as fallback_exc:
            logger.warning(
                "Chat Completions fallback failed: %s",
                fallback_exc.__class__.__name__,
            )
            raise LearningAnalysisLlmError(_map_openai_error(fallback_exc)) from fallback_exc
    except (
        AuthenticationError,
        PermissionDeniedError,
        RateLimitError,
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

    if not answer:
        raise LearningAnalysisLlmError("AI model бос жауап қайтарды.")

    return answer
