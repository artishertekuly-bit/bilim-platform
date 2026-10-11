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
GROQ_DEFAULT_CHAT_MODEL = "llama-3.1-8b-instant"
GROQ_FALLBACK_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama3-8b-8192",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
]
EDGE_TTS_DEFAULT_VOICE_KK = "kk-KZ-AigulNeural"
EDGE_TTS_DEFAULT_VOICE_RU = "ru-RU-SvetlanaNeural"

DEFAULT_SYSTEM_PROMPT = """Сен — Bilim Platform платформасының ақылды дауыстық көмекшісісің.
Пайдаланушыға білім, сабақтар, ғылым және оқу тақырыптары бойынша көмектесесің.
ЕРЕЖЕЛЕР:
1. Жауабың дауыспен (TTS) оқылатындықтан, сөздеріңді тыңдауға ыңғайлы, табиғи және қарапайым етіп құра.
2. Ешқандай markdown белгілерін, жұлдызшаларды (*), шаршы жақшаларды, кестелерді немесе кодты қолданба.
3. Жауап көлемі шағын әрі нақты болсын (әдетте 2-4 сөйлем).
4. Пайдаланушы қай тілде сұраса (қазақша немесе орысша), дәл сол тілде жауап бер."""


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
    """Удаляет markdown и спецсимволы, делая текст чистым для озвучки edge-tts."""
    cleaned = re.sub(r"[\*#_`~>\[\]\(\)]", "", text)
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
    Транскрибирует аудио через Groq API Whisper-large (быстро и бесплатно).
    """
    if not audio_bytes:
        raise ValueError("Аудиофайл бос болмауы керек.")

    client = get_groq_client()
    whisper_model = (os.getenv("GROQ_WHISPER_MODEL") or GROQ_DEFAULT_WHISPER_MODEL).strip()

    # Whisper в Groq принимает кортеж (имя файла, байты, MIME-тип)
    file_tuple = (filename, audio_bytes)
    kwargs: dict[str, Any] = {
        "file": file_tuple,
        "model": whisper_model,
        "response_format": "json",
    }
    if language in {"kk", "ru", "en"}:
        kwargs["language"] = language

    try:
        transcription = await client.audio.transcriptions.create(**kwargs)
        text = getattr(transcription, "text", "") or ""
        return text.strip()
    except Exception as exc:
        logger.exception("Groq whisper transcription error: %s", exc)
        raise RuntimeError(f"Дауысты тану кезінде қате пайда болды (Groq Whisper): {exc}") from exc


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
    configured_model = (os.getenv("GROQ_MODEL") or "").strip()

    candidate_models: list[str] = []
    if configured_model:
        candidate_models.append(configured_model)
    for model_name in GROQ_FALLBACK_MODELS:
        if model_name not in candidate_models:
            candidate_models.append(model_name)

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
            if "model_not_found" in err_msg or "does not exist" in err_msg or "404" in err_msg or "access" in err_msg:
                logger.warning("Groq model '%s' қолжетімсіз (404), келесі модельге көшудеміз: %s", model_to_use, exc)
                last_error = exc
                continue
            logger.exception("Groq chat completion error on '%s': %s", model_to_use, exc)
            raise RuntimeError(f"Жауапты генерациялау кезінде қате пайда болды (Groq LLM): {exc}") from exc

    if last_error:
        raise RuntimeError(f"Жауапты генерациялау кезінде қате пайда болды (Groq LLM): {last_error}")
    raise RuntimeError("Қолжетімді Groq моделі табылмады.")


async def synthesize_speech_edge_tts(
    text: str,
    language: str = "kk",
    voice: str | None = None,
) -> bytes:
    """
    Озвучивает текст через edge-tts без нагрузки на CPU/RAM сервера Render.
    Генерирует MP3 поток напрямую в память.
    """
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError(
            "edge-tts кітапханасы орнатылмаған. 'pip install edge-tts' орындаңыз."
        ) from exc

    cleaned_text = clean_voice_text(text)
    if not cleaned_text:
        cleaned_text = "Сіздің сұрағыңызды түсінбедім, қайталап көріңізші."

    if not voice:
        voice_kk = os.getenv("EDGE_TTS_VOICE_KK", EDGE_TTS_DEFAULT_VOICE_KK).strip()
        voice_ru = os.getenv("EDGE_TTS_VOICE_RU", EDGE_TTS_DEFAULT_VOICE_RU).strip()
        voice = voice_ru if language == "ru" else voice_kk

    try:
        communicate = edge_tts.Communicate(cleaned_text, voice)
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
