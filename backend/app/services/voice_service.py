from __future__ import annotations

import io
import logging
import os
import re
from typing import Any

logger = logging.getLogger("bilimcorp.voice.service")

# Qwen моделдерінің басымдық тізімі (Groq немесе OpenAI-үйлесімді провайдерлер)
DEFAULT_QWEN_MODELS = [
    "qwen/qwen3.8-27b",
    "qwen/qwen-2.5-32b",
    "qwen-2.5-32b",
    "deepseek-r1-distill-qwen-32b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]

# Оқушыларға арналған жастар стиліндегі жүйелік нұсқаулық
QWEN_SYSTEM_PROMPT = """Сен — Bilim Platform платформасының оқушыларға арналған ақылды, тапқыр әрі мейірімді AI аудио-көмекшісісің.
Сенің басты мақсатың — оқушыларға сабақ, ғылым және мектеп тақырыптары бойынша жеңіл әрі қазіргі заманғы жастарға сай тілде қысқа және тартымды жауап беру.

МАҢЫЗДЫ ЕРЕЖЕЛЕР:
1. Тіл және стиль: Қазіргі қазақ жастарының сөйлесу мәнеріндей жылы, достық әрі шабыттандыратын көңіл-күй («Сәлем, достым!», «Керемет сұрақ!», «Бұл өте қызық, қара...»).
2. Қысқа әрі нақты: Жауабың аудио арқылы дауыспен оқылатындықтан, ұзақ созба. Небәрі 1-3 қысқа сөйлем (максимум 30-45 сөз).
3. Дауысқа арналған таза мәтін: Ешқашан жұлдызша (*), шаршы жақша, решетка (#), markdown белгілерін, кестелерді немесе эмодзилерді мәтін ішіне жазба. Тек тыңдауға ыңғайлы, табиғи адамша оқылатын сөздер мен үтір-нүктелер болсын.
4. Қарапайым мысал: Күрделі ұғымдар мен формулаларды оқушыға бірден түсінікті болатын қарапайым өмірлік мысалмен жеткіз.
5. Эмоция: Әр жауабыңның соңына міндетті түрде мына үш эмоция белгісінің бірін қой: [EMOTION:happy], [EMOTION:thinking] немесе [EMOTION:speaking]."""


def clean_voice_text(text: str) -> str:
    """
    Дауыспен оқуға оңтайландыру:
    Markdown белгілерін, жұлдызшаларды (*), шаршы жақшаларды алып тастайды,
    паузаларды табиғи адам тыныс алуына сәйкестейді.
    """
    if not text:
        return ""
    # Remove markdown formatting characters
    cleaned = re.sub(r"[\*#_`~>\[\]\(\)]", "", text)
    # Convert semicolons, colons and long dashes to commas with pauses
    cleaned = re.sub(r"[:;]\s+", ", ", cleaned)
    cleaned = re.sub(r"[—–]", ", ", cleaned)
    # Remove duplicate commas
    cleaned = re.sub(r",+", ",", cleaned)
    # Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def extract_emotion_and_clean_text(raw_reply: str) -> tuple[str, str]:
    """
    Qwen жауабынан [EMOTION:happy|thinking|speaking] тегін бөліп алады,
    ал қалған таза мәтінді дыбыстауға дайындайды.
    """
    emotion = "happy"
    match = re.search(r"\[EMOTION:\s*(happy|thinking|speaking)\]", raw_reply, re.IGNORECASE)
    if match:
        emotion = match.group(1).lower()
        cleaned_reply = re.sub(r"\[EMOTION:\s*(happy|thinking|speaking)\]", "", raw_reply, flags=re.IGNORECASE)
    else:
        cleaned_reply = raw_reply

    cleaned_text = clean_voice_text(cleaned_reply)
    if not cleaned_text:
        cleaned_text = "Сұрағыңды түсіндім! Тағы бір рет нақтылап көрейікші."
    return cleaned_text, emotion


async def transcribe_whisper(
    audio_bytes: bytes,
    filename: str = "recording.webm",
    language: str = "kk",
) -> str:
    """
    1. Whisper Speech-to-Text:
    Groq Whisper (найзағайдай жылдам ~150-250мс) немесе OpenAI Whisper арқылы
    қазақ тіліндегі аудионы мәтінге айналдырады.
    """
    if not audio_bytes:
        raise ValueError("Бос аудио файл берілді.")

    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()

    file_tuple = (filename, audio_bytes)

    # 1. Groq Whisper (ең жылдам және тиімді)
    if groq_key:
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=groq_key)
            whisper_model = (os.getenv("GROQ_WHISPER_MODEL") or "whisper-large-v3-turbo").strip()

            resp = await client.audio.transcriptions.create(
                file=file_tuple,
                model=whisper_model,
                language=language if language in {"kk", "ru", "en"} else "kk",
                response_format="json",
            )
            transcript = getattr(resp, "text", "") or ""
            if transcript.strip():
                logger.info("Groq Whisper transcription success: %s", transcript[:60])
                return transcript.strip()
        except Exception as exc:
            logger.warning("Groq Whisper failed, trying OpenAI fallback: %s", exc)

    # 2. OpenAI Whisper fallback
    if openai_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_key)
            resp = await client.audio.transcriptions.create(
                file=file_tuple,
                model="whisper-1",
                language=language if language in {"kk", "ru", "en"} else "kk",
                response_format="json",
            )
            transcript = getattr(resp, "text", "") or ""
            if transcript.strip():
                logger.info("OpenAI Whisper transcription success: %s", transcript[:60])
                return transcript.strip()
        except Exception as exc:
            logger.warning("OpenAI Whisper transcription failed: %s", exc)

    raise RuntimeError("Whisper арқылы дауысты тану сәтсіз аяқталды. GROQ_API_KEY немесе OPENAI_API_KEY тексеріңіз.")


async def generate_qwen_response(
    user_text: str,
    history: list[dict[str, str]] | None = None,
    system_prompt: str | None = None,
) -> tuple[str, str]:
    """
    2. Qwen LLM Response Generation:
    Оқушыларға жеңіл, қазіргі жастарға сай тілде қысқа әрі тартымды жауап береді.
    Қайтарады: (ai_reply, emotion)
    """
    if not user_text.strip():
        return "Сәлем! Сені тыңдап тұрмын, сұрағыңды қоя бер!", "happy"

    prompt = system_prompt or QWEN_SYSTEM_PROMPT

    messages: list[dict[str, str]] = [
        {"role": "system", "content": prompt}
    ]

    if history:
        for item in history[-4:]:
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content.strip()})

    messages.append({"role": "user", "content": user_text.strip()})

    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    qwen_key = (os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or "").strip()
    configured_model = (os.getenv("QWEN_MODEL") or "").strip()

    candidate_models: list[str] = []
    if configured_model:
        candidate_models.append(configured_model)
    for model_name in DEFAULT_QWEN_MODELS:
        if model_name not in candidate_models:
            candidate_models.append(model_name)

    # 1. Qwen via Groq API (найзағайдай жылдам ~150-200мс)
    if groq_key:
        from groq import AsyncGroq
        groq_client = AsyncGroq(api_key=groq_key)

        for model_to_try in candidate_models:
            try:
                completion = await groq_client.chat.completions.create(
                    model=model_to_try,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=220,
                )
                raw_text = completion.choices[0].message.content or ""
                if raw_text.strip():
                    cleaned, emotion = extract_emotion_and_clean_text(raw_text)
                    logger.info("Qwen (via Groq '%s') generated response [%s]: %s", model_to_try, emotion, cleaned[:60])
                    return cleaned, emotion
            except Exception as exc:
                err_lower = str(exc).lower()
                if any(x in err_lower for x in ("model_not_found", "decommissioned", "deprecated", "404", "400")):
                    logger.warning("Groq model '%s' unavailable, trying next: %s", model_to_try, exc)
                    continue
                logger.warning("Groq completion failed on '%s': %s", model_to_try, exc)

    # 2. Qwen via DashScope / Alibaba Cloud API (егер QWEN_API_KEY болса)
    if qwen_key:
        try:
            import httpx
            dashscope_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {qwen_key}",
                "Content-Type": "application/json",
            }
            body = {
                "model": configured_model or "qwen-turbo",
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 220,
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(dashscope_url, headers=headers, json=body)
                if res.status_code == 200:
                    data = res.json()
                    raw_text = data["choices"][0]["message"]["content"]
                    return extract_emotion_and_clean_text(raw_text)
        except Exception as qwen_err:
            logger.warning("Direct Qwen API error: %s", qwen_err)

    # 3. OpenAI Fallback
    if openai_key:
        try:
            from openai import AsyncOpenAI
            openai_client = AsyncOpenAI(api_key=openai_key)
            completion = await openai_client.chat.completions.create(
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                messages=messages,
                temperature=0.7,
                max_tokens=220,
            )
            raw_text = completion.choices[0].message.content or ""
            return extract_emotion_and_clean_text(raw_text)
        except Exception as oai_err:
            logger.warning("OpenAI fallback failed: %s", oai_err)

    return "Сәлем, достым! Сұрағың өте қызық екен. Қайталап айтып жібересің бе?", "happy"


async def synthesize_speech_elevenlabs(
    text: str,
    voice_id: str | None = None,
) -> bytes:
    """
    3. ElevenLabs Text-to-Speech:
    Қазақ тіліндегі мәтінді ElevenLabs көптілді моделі арқылы табиғи адам дауысымен дыбыстайды.
    Егер ELEVENLABS_API_KEY табылмаса немесе қате болса, қауіпсіз Edge-TTS-ке ауысады.
    """
    cleaned_text = clean_voice_text(text)
    if not cleaned_text:
        cleaned_text = "Сәлем, достым!"

    eleven_key = (os.getenv("ELEVENLABS_API_KEY") or "").strip()
    active_voice_id = voice_id or os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Default: Rachel
    model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")

    if eleven_key:
        try:
            import httpx
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{active_voice_id}"
            headers = {
                "xi-api-key": eleven_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            }
            payload = {
                "text": cleaned_text,
                "model_id": model_id,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.8,
                    "style": 0.35,
                    "use_speaker_boost": True,
                },
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200 and resp.content:
                    logger.info("ElevenLabs TTS success (size=%d bytes)", len(resp.content))
                    return resp.content
                else:
                    logger.warning("ElevenLabs API returned %s: %s", resp.status_code, resp.text[:120])
        except Exception as exc:
            logger.warning("ElevenLabs synthesis error, falling back to edge-tts: %s", exc)

    # Сақтық нұсқа: Edge-TTS қазақша дауысы (жүйе ешқашан үзілмейді)
    return await _synthesize_edge_tts_fallback(cleaned_text)


async def _synthesize_edge_tts_fallback(text: str) -> bytes:
    """Сақтық көшірме: edge-tts арқылы қазақша MP3 дауыс дайындау."""
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, "kk-KZ-DauletNeural", rate="-3%", pitch="+0Hz")
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        return buffer.getvalue()
    except Exception as exc:
        logger.exception("Fallback edge-tts synthesis failed: %s", exc)
        raise RuntimeError(f"Дыбыс генерациялау қатесі: {exc}") from exc
