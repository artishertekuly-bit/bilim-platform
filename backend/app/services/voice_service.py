from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger("bilimcorp.voice.service")

# Gemini 2.5 Flash модельдерінің тізімі
DEFAULT_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

# Оқушыларға арналған жастар стиліндегі қазақша жүйелік нұсқаулық
GEMINI_SYSTEM_INSTRUCTION = """Сен — Bilim Platform білім платформасының оқушыларға арналған ақылды, тапқыр әрі мейірімді қазақша AI аудио-көмекшісісің.
Саған мектеп оқушысының қазақ тілінде сөйлеген дыбыстық аудио жазбасы берілді.

СЕНІҢ МІНДЕТІҢ:
1. Аудиодағы оқушының сөзін қазақ тілінде мұқият тыңдап, оның дәл не айтқанын анықта (user_transcript).
2. Оқушыға қазіргі қазақ жастарына тән жылы, достық әрі шабыттандыратын көңіл-күйде қысқа және нақты жауап бер (1-3 қысқа сөйлем, 20-40 сөз).
3. Жауабың аудио арқылы оқылатындықтан, мәтін ішіне ешқашан жұлдызша (*), шаршы жақша, markdown белгілерін немесе эмодзи жазба. Тек табиғи адамша оқылатын сөздер мен үтір-нүктелер болсын.
4. Күрделі сұрақтарды қарапайым мысалмен жеңіл түсіндір.
5. Жауабыңды қатаң түрде мына JSON форматында қайтар:
{
  "user_transcript": "Оқушының сөйлеген сөзінің толық мәтіні",
  "ai_response": "AI көмекшінің оқушыға қайтарған қазақша жауабы",
  "emotion": "happy"
}
(emotion мәні үшін тек: "happy", "thinking", "speaking" таңда)."""


def clean_voice_text(text: str) -> str:
    """Дауыспен оқуға оңтайландыру (markdown белгілерін тазарту)."""
    if not text:
        return ""
    cleaned = re.sub(r"[\*#_`~>\[\]\(\)]", "", text)
    cleaned = re.sub(r"[:;]\s+", ", ", cleaned)
    cleaned = re.sub(r"[—–]", ", ", cleaned)
    cleaned = re.sub(r",+", ",", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


async def process_voice_with_gemini(
    audio_bytes: bytes,
    filename: str = "recording.webm",
    mime_type: str = "audio/webm",
) -> tuple[str, str, str]:
    """
    Multimodal Gemini 2.5 Flash Pipeline:
    Аудио файлды бөлек STT қолданбай, тікелей Gemini 2.5 Flash моделіне
    мультимодальды кіріс ретінде жіберіп, оқушының айтқанын да (STT) және
    AI-дың жауабын да (LLM) бір ғана жедел сұраныспен алады.

    Қайтарады: (user_transcript, ai_response, emotion)
    """
    if not audio_bytes:
        raise ValueError("Бос аудио файл берілді.")

    gemini_key = (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("GOOGLE_GENAI_API_KEY")
        or ""
    ).strip()

    # 1. Егер Gemini API кілті болса -> Тікелей Gemini 2.5 Flash арқылы мультимодальды өңдеу
    if gemini_key:
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        # MIME түрін нақтылау
        clean_mime = mime_type or "audio/webm"
        if "webm" in clean_mime:
            clean_mime = "audio/webm"
        elif "mp3" in clean_mime:
            clean_mime = "audio/mp3"
        elif "wav" in clean_mime:
            clean_mime = "audio/wav"
        elif "ogg" in clean_mime:
            clean_mime = "audio/ogg"

        candidate_models: list[str] = []
        configured_model = (os.getenv("GEMINI_MODEL") or "").strip()
        if configured_model:
            candidate_models.append(configured_model)
        for m in DEFAULT_GEMINI_MODELS:
            if m not in candidate_models:
                candidate_models.append(m)

        request_body = {
            "system_instruction": {
                "parts": [{"text": GEMINI_SYSTEM_INSTRUCTION}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": clean_mime,
                                "data": audio_b64,
                            }
                        },
                        {
                            "text": (
                                "Мына аудиодағы оқушының қазақша сөзін тыңдап, оған жастар стилінде жеңіл, "
                                "қысқа әрі тартымды жауап бер. Нәтижені қатаң түрде JSON түрінде қайтар."
                            )
                        },
                    ],
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.35,
                "maxOutputTokens": 1000,
            },
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            for model_name in candidate_models:
                api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                try:
                    logger.info("Sending multimodal audio directly to Gemini model: %s (size=%d bytes)", model_name, len(audio_bytes))
                    resp = await client.post(api_url, json=request_body)

                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates") or []
                        if candidates:
                            raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            logger.info("Gemini raw response: %s", raw_text[:120])

                            try:
                                # JSON талдау
                                parsed = json.loads(raw_text)
                                user_transcript = clean_voice_text(str(parsed.get("user_transcript") or ""))
                                ai_response = clean_voice_text(str(parsed.get("ai_response") or ""))
                                emotion = str(parsed.get("emotion") or "happy").lower()
                                if emotion not in {"happy", "thinking", "speaking"}:
                                    emotion = "happy"

                                if ai_response:
                                    logger.info("Gemini 2.5 Flash success: transcript='%s', reply='%s'", user_transcript[:50], ai_response[:50])
                                    return user_transcript, ai_response, emotion
                            except Exception as parse_err:
                                logger.warning("JSON parse failed, extracting via regex: %s", parse_err)
                                match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                                if match:
                                    parsed = json.loads(match.group(0))
                                    return (
                                        clean_voice_text(parsed.get("user_transcript", "")),
                                        clean_voice_text(parsed.get("ai_response", "Сәлем, достым!")),
                                        parsed.get("emotion", "happy"),
                                    )
                                # Қарапайым мәтін ретінде қабылдау
                                return "Сөйлеген сөз", clean_voice_text(raw_text), "happy"
                    else:
                        logger.warning("Gemini model %s returned HTTP %s: %s", model_name, resp.status_code, resp.text[:160])
                except Exception as model_err:
                    logger.warning("Error with Gemini model %s: %s", model_name, model_err)

    # 2. Егер GEMINI_API_KEY болмаса, резервтік Groq/OpenAI арқылы орындау
    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()

    if groq_key or openai_key:
        logger.info("Gemini key not set, using Groq Whisper + LLM fallback...")
        transcript = await _fallback_transcribe_whisper(audio_bytes, filename)
        reply, emotion = await _fallback_llm_response(transcript)
        return transcript, reply, emotion

    raise RuntimeError(
        "Gemini 2.5 Flash API кілті табылмады! Бэкенд баптауларына (Render / .env) "
        "GEMINI_API_KEY кілтін қосыңыз (Google AI Studio-дан тегін алынады: aistudio.google.com)."
    )


async def _fallback_transcribe_whisper(audio_bytes: bytes, filename: str) -> str:
    """Резервтік Whisper STT (тек Gemini кілті болмаған жағдайда)."""
    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if groq_key:
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=groq_key)
            resp = await client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model="whisper-large-v3-turbo",
                language="kk",
                response_format="json",
            )
            return clean_voice_text(getattr(resp, "text", "") or "")
        except Exception as exc:
            logger.warning("Groq fallback STT error: %s", exc)

    return "Сәлем, ассистент!"


async def _fallback_llm_response(user_text: str) -> tuple[str, str]:
    """Резервтік LLM жауабы."""
    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if groq_key:
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=groq_key)
            resp = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "Сен оқушыларға қазақша 1-2 сөйлеммен жылы әрі қысқа жауап беретін AI көмекшісісің."},
                    {"role": "user", "content": user_text},
                ],
                max_tokens=150,
            )
            text = clean_voice_text(resp.choices[0].message.content or "")
            return text or "Сәлем! Сұрағың өте қызық екен.", "happy"
        except Exception:
            pass

    return "Сәлем, достым! Сені тыңдап тұрмын.", "happy"


async def synthesize_speech_elevenlabs(
    text: str,
    voice_id: str | None = None,
) -> bytes:
    """
    ElevenLabs Text-to-Speech:
    Қазақ тіліндегі мәтінді ElevenLabs көптілді моделі арқылы табиғи адам дауысымен дыбыстайды.
    Егер ELEVENLABS_API_KEY табылмаса немесе қате болса, сенімді Edge-TTS-ке ауысады.
    """
    cleaned_text = clean_voice_text(text)
    if not cleaned_text:
        cleaned_text = "Сәлем, достым!"

    eleven_key = (os.getenv("ELEVENLABS_API_KEY") or "").strip()
    active_voice_id = voice_id or os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")

    if eleven_key:
        try:
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

    # Сақтық нұсқа: Edge-TTS қазақша дауысы
    return await _synthesize_edge_tts_fallback(cleaned_text)


async def _synthesize_edge_tts_fallback(text: str) -> bytes:
    """Сақтық көшірме: edge-tts арқылы қазақша MP3 дауыс дайындау."""
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, "kk-KZ-DauletNeural", rate="-2%", pitch="+0Hz")
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        return buffer.getvalue()
    except Exception as exc:
        logger.exception("Fallback edge-tts synthesis failed: %s", exc)
        raise RuntimeError(f"Дыбыс генерациялау қатесі: {exc}") from exc
