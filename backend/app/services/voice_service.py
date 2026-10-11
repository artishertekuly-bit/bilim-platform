from __future__ import annotations

import io
import logging
import os
import re
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
ENV_FILES = [ROOT_DIR / ".env", BACKEND_DIR / ".env"]

for env_file in ENV_FILES:
    if env_file.exists():
        load_dotenv(env_file, override=False)

logger = logging.getLogger("bilimcorp.ai.voice")

GROQ_DEFAULT_WHISPER_MODEL = "whisper-large-v3"
GROQ_DEFAULT_CHAT_MODEL = "openai/gpt-oss-20b"
GROQ_FALLBACK_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
]

# Ескірген/өшірілген модель атауларын қазіргі белсенді өндірістік баламасына автоматты түрде бағыттау
DEPRECATED_MODELS_MAP = {
    # Gemma (өшірілген) -> openai/gpt-oss-20b
    "gemma2-9b-it": "openai/gpt-oss-20b",
    "gemma-7b-it": "openai/gpt-oss-20b",
    # Llama 3 (өшірілген) -> openai/gpt-oss-20b
    "llama3-8b-8192": "openai/gpt-oss-20b",
    "llama3-70b-8192": "openai/gpt-oss-120b",
    "llama-3-8b-8192": "openai/gpt-oss-20b",
    "llama-3-70b-8192": "openai/gpt-oss-120b",
    # Llama 3.1 & 3.3 (өшірілген) -> openai/gpt-oss-20b / 120b
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.1-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.2-1b-preview": "openai/gpt-oss-20b",
    "llama-3.2-3b-preview": "openai/gpt-oss-20b",
    "llama-3.2-11b-vision-preview": "openai/gpt-oss-120b",
    "llama-3.2-90b-vision-preview": "openai/gpt-oss-120b",
    # Mixtral & Mistral
    "mixtral-8x7b-32768": "openai/gpt-oss-20b",
    "mistral-saba-24b": "qwen/qwen3.8-27b",
    # Qwen ескі нұсқалары
    "qwen/qwen3.6-27b": "qwen/qwen3.8-27b",
    "qwen/qwen3-32b": "openai/gpt-oss-120b",
    "qwen-qwq-32b": "qwen/qwen3.8-27b",
    "qwen-2.5-32b": "qwen/qwen3.8-27b",
    "qwen-2.5-coder-32b": "openai/gpt-oss-120b",
    # DeepSeek
    "deepseek-r1-distill-llama-70b": "openai/gpt-oss-120b",
    "deepseek-r1-distill-qwen-32b": "qwen/qwen3.8-27b",
}

EDGE_TTS_DEFAULT_VOICE_KK = "kk-KZ-DauletNeural"
EDGE_TTS_DEFAULT_VOICE_RU = "ru-RU-DmitryNeural"

DEFAULT_SYSTEM_PROMPT = """Сен — Bilim Platform платформасының ақылды дауыстық көмекшісісің.
Пайдаланушыға білім, сабақтар, ғылым және оқу тақырыптары бойынша көмектесесің.
ЕРЕЖЕЛЕР:
1. Жауабың дауыспен (TTS) оқылатындықтан, сөздеріңді тыңдауға ыңғайлы, табиғи, жанды және адамша құра.
2. Ешқандай markdown белгілерін, жұлдызшаларды (*), шаршы жақшаларды, кестелерді немесе кодты қолданба.
3. Сөйлемдер арасына үтір мен нүктелерді дұрыс қой (бұл роботтық дыбысты жойып, адамша тыныс алуға көмектеседі).
4. Жауап көлемі шағын әрі нақты болсын (әдетте 2-4 сөйлем).
5. Пайдаланушы қай тілде сұраса (қазақша немесе орысша), дәл сол тілде жауап бер."""


def get_groq_api_key() -> str:
    key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not key:
        raise ValueError(
            "GROQ_API_KEY орта айнымалысы табылмады. "
            "Өтінеміз, .env файлына GROQ_API_KEY мәнін енгізіңіз (console.groq.com сайтынан алуға болады)."
        )
    return key


def get_groq_client():
    try:
        from groq import AsyncGroq
        return AsyncGroq(api_key=get_groq_api_key())
    except ImportError:
        # Fallback to AsyncOpenAI with Groq base URL if groq package is not installed
        try:
            from openai import AsyncOpenAI
            return AsyncOpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=get_groq_api_key(),
            )
        except ImportError as exc:
            raise RuntimeError(
                "Groq клиенті табылмады. 'pip install groq' немесе 'pip install openai' орнатыңыз."
            ) from exc


def clean_voice_text(text: str) -> str:
    """Удаляет markdown и спецсимволы, оптимизируя паузы для естественного человеческого звучания."""
    cleaned = re.sub(r"[\*#_`~>\[\]\(\)]", "", text)
    # Двоеточия, точки с запятой и длинные тире превращаем в естественные запятые с паузой
    cleaned = re.sub(r"[:;]\s+", ", ", cleaned)
    cleaned = re.sub(r"[—–]", ", ", cleaned)
    # Убираем двойные знаки препинания
    cleaned = re.sub(r",+", ",", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def detect_language(text: str, fallback: str = "kk") -> str:
    """Определяет язык текста (қазақша или орысша)."""
    kazakh_specific_letters = set("әіңғүұқөһӘІҢҒҮҰҚӨҺ")
    if any(ch in kazakh_specific_letters for ch in text):
        return "kk"
    # Проверка на кириллицу
    cyrillic_count = len(re.findall(r"[а-яА-ЯёЁ]", text))
    if cyrillic_count > 0:
        return "ru" if fallback == "ru" else "kk"
    return fallback


async def transcribe_audio_groq(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    language: str | None = None,
) -> str:
    """
    Транскрибирует аудио через Groq API Whisper (быстро и бесплатно).
    """
    if not audio_bytes:
        raise ValueError("Аудиофайл бос болмауы керек.")

    client = get_groq_client()
    whisper_candidates = [
        (os.getenv("GROQ_WHISPER_MODEL") or "").strip(),
        GROQ_DEFAULT_WHISPER_MODEL,
        "whisper-large-v3-turbo",
        "whisper-large-v3",
    ]
    seen_whisper: set[str] = set()
    whisper_models: list[str] = []
    for m in whisper_candidates:
        if m and m not in seen_whisper:
            seen_whisper.add(m)
            whisper_models.append(m)

    file_tuple = (filename, audio_bytes)
    last_whisper_err: Exception | None = None

    for model_name in whisper_models:
        kwargs: dict[str, Any] = {
            "file": file_tuple,
            "model": model_name,
            "response_format": "json",
        }
        if language in {"kk", "ru", "en"}:
            kwargs["language"] = language

        try:
            transcription = await client.audio.transcriptions.create(**kwargs)
            text = getattr(transcription, "text", "") or ""
            return text.strip()
        except Exception as exc:
            err_msg = str(exc).lower()
            if (
                "model_not_found" in err_msg
                or "model_decommissioned" in err_msg
                or "decommissioned" in err_msg
                or "does not exist" in err_msg
                or "no longer supported" in err_msg
                or "404" in err_msg
                or "400" in err_msg
            ):
                logger.warning(
                    "Groq whisper '%s' қолжетімсіз, келесі нұсқаға көшудеміз: %s",
                    model_name,
                    exc,
                )
                last_whisper_err = exc
                continue
            logger.exception("Groq whisper transcription error: %s", exc)
            raise RuntimeError(f"Дауысты тану кезінде қате пайда болды (Groq Whisper): {exc}") from exc

    if last_whisper_err:
        raise RuntimeError(f"Дауысты тану кезінде қате пайда болды (Groq Whisper): {last_whisper_err}")
    raise RuntimeError("Қолжетімді Groq Whisper моделі табылмады.")


async def generate_voice_llm_response(
    user_text: str,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> str:
    """
    Генерирует ответ через Groq LLM (Llama 3.3 70B или Llama 3.1 8B).
    """
    if not user_text.strip():
        raise ValueError("Сұрақ мәтіні бос.")

    client = get_groq_client()
    raw_configured_model = (os.getenv("GROQ_MODEL") or "").strip()
    configured_model = DEPRECATED_MODELS_MAP.get(raw_configured_model, raw_configured_model)

    candidate_models: list[str] = []
    if configured_model:
        candidate_models.append(configured_model)
    for model_name in GROQ_FALLBACK_MODELS:
        active_name = DEPRECATED_MODELS_MAP.get(model_name, model_name)
        if active_name not in candidate_models:
            candidate_models.append(active_name)

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}
    ]

    if history:
        for item in history[-6:]:
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_text.strip()})

    last_error: Exception | None = None
    for model_to_use in candidate_models:
        try:
            completion = await client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                temperature=0.6,
                max_tokens=500,
            )
            reply = completion.choices[0].message.content or ""
            return reply.strip()
        except Exception as exc:
            err_msg = str(exc).lower()
            if (
                "model_not_found" in err_msg
                or "model_decommissioned" in err_msg
                or "decommissioned" in err_msg
                or "does not exist" in err_msg
                or "no longer supported" in err_msg
                or "deprecated" in err_msg
                or "404" in err_msg
                or "400" in err_msg
                or "access" in err_msg
            ):
                logger.warning(
                    "Groq model '%s' қолжетімсіз немесе ескірген, келесі модельге көшудеміз: %s",
                    model_to_use,
                    exc,
                )
                last_error = exc
                continue
            logger.exception("Groq chat completion error on '%s': %s", model_to_use, exc)
            raise RuntimeError(f"Жауапты генерациялау кезінде қате пайда болды (Groq LLM): {exc}") from exc

    if last_error:
        raise RuntimeError(f"Жауапты генерациялау кезінде қате пайда болды (Groq LLM): {last_error}")
    raise RuntimeError("Қолжетімді Groq моделі табылмады.")


async def synthesize_speech_openai(text: str, voice: str = "nova") -> bytes:
    """Синтезирует речь через студийный OpenAI TTS-1 (человеческое, эмоциональное звучание)."""
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("OPENAI_API_KEY орта айнымалысы табылмады.")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    response = await client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=clean_voice_text(text),
    )
    return response.content


async def synthesize_speech_edge_tts(
    text: str,
    language: str = "kk",
    voice: str | None = None,
) -> bytes:
    """
    Озвучивает текст через edge-tts (с калибровкой темпа) либо OpenAI TTS.
    Генерирует MP3 поток напрямую в память.
    """
    cleaned_text = clean_voice_text(text)
    if not cleaned_text:
        cleaned_text = "Сіздің сұрағыңызды түсінбедім, қайталап көріңізші."

    # Егер OpenAI дауысы сұралса немесе voice OpenAI дауыстарынан болса
    if voice and (
        voice.startswith("openai:")
        or voice in {"alloy", "nova", "echo", "shimmer", "fable", "onyx"}
    ):
        openai_voice_name = voice.replace("openai:", "")
        try:
            return await synthesize_speech_openai(cleaned_text, voice=openai_voice_name)
        except Exception as oai_err:
            logger.warning("OpenAI TTS орындалмады, Edge-TTS-ке көшеміз: %s", oai_err)
            voice = None

    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError(
            "edge-tts кітапханасы орнатылмаған. 'pip install edge-tts' орындаңыз."
        ) from exc

    if not voice:
        voice_kk = os.getenv("EDGE_TTS_VOICE_KK", EDGE_TTS_DEFAULT_VOICE_KK).strip()
        voice_ru = os.getenv("EDGE_TTS_VOICE_RU", EDGE_TTS_DEFAULT_VOICE_RU).strip()
        voice = voice_ru if language == "ru" else voice_kk

    try:
        # rate="-4%" сәл баяулатып, табиғи адамның сөйлеу жылдамдығы мен интонациясын қалыптастырады
        communicate = edge_tts.Communicate(cleaned_text, voice, rate="-4%", pitch="+0Hz")
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        return buffer.getvalue()
    except Exception as exc:
        logger.exception("Edge-TTS synthesis error: %s", exc)
        raise RuntimeError(f"Дыбыстау кезінде қате пайда болды (edge-tts): {exc}") from exc


def save_voice_chat_history_safe(
    user_id: str | None,
    user_transcript: str,
    ai_response: str,
    language: str = "kk",
) -> None:
    """
    Сақтайды дауыстық чат тарихын Supabase voice_chat_history кестесіне.
    Егер кесте әлі қосылмаған немесе Supabase бапталмаған болса, қатені журналға жазып, үдерісті үзбейді.
    """
    if not user_id:
        return

    try:
        from ..ai_storage import _get_supabase
        supabase = _get_supabase()
        payload = {
            "user_id": user_id,
            "user_transcript": user_transcript,
            "ai_response": ai_response,
            "language": language,
            "created_at": datetime.now(UTC).isoformat(),
        }
        supabase.table("voice_chat_history").insert(payload).execute()
        logger.info("Saved voice chat history for user_id=%s", user_id)
    except Exception as exc:
        # Логируем, но не блокируем клиента
        logger.warning("Could not save to voice_chat_history table: %s", exc)
