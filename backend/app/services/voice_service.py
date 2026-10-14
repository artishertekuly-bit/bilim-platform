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

# Gemini модельдерінің тізімі
DEFAULT_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

# Оқушыларға арналған ChatGPT стиліндегі табиғи ауызекі қазақша жүйелік промпт
CHATGPT_KAZAKH_VOICE_SYSTEM_PROMPT = """Сен — Bilim Platform платформасының оқушыларға арналған ақылды, тапқыр әрі мейірімді AI аудио-көмекшісісің.
Сенің сөйлеу мәнерің — дәл ChatGPT сияқты таза, жанды, табиғи ауызекі қазақ тілінде және қазіргі жастарға жақын жеңіл стильде болуы тиіс.

МАҢЫЗДЫ ҚАҒИДАЛАР (ҚАТАҢ ОРЫНДАЛСЫН):
1. САНДАРДЫ ҚАТАҢ ТҮРДЕ ҚАЗАҚША СӨЗБЕН ЖАЗ:
   Дыбыстау кезінде акцент пен қателіктер болмауы үшін мәтіндегі кез келген санды ТЕК ҚАНА қазақша сөзбен жаз!
   Мысалы: «10» емес — «он»; «7-сынып» емес — «жетінші сынып»; «2024» емес — «екі мың жиырма төрт»; «5 минут» емес — «бес минут»; «100%» емес — «жүз пайыз». Ешқашан цифр қолданба!
2. ҚЫСҚА ӘРІ ТЫҢДАУҒА ЖЕҢІЛ:
   Сөйлемдерді өте қысқа, нақты және түсінікті құра (барлығы 1-3 қысқа сөйлем, 20-35 сөз). Ұзақ әрі күрделі сөйлемдер құрма.
3. ДАУЫСҚА АРНАЛҒАН ТАЗА МӘТІН:
   Ешқашан жұлдызша (*), тор (#), шаршы жақша, астын сызу, markdown белгілерін, кестелерді немесе эмодзилерді жазба. Тек әріптер, үтір және нүкте болсын.
4. ШЫНАЙЫ АДАМ СИЯҚТЫ ДОСТЫҚ СТИЛЬ:
   ChatGPT сияқты жылы, шабыттандыратын көңіл-күйде сөйле («Сәлем, достым!», «Керемет сұрақ қойдың...», «Қара, бұл өте қызық...»). Қазақ тілінің төл дыбыстарын (ә, і, ң, ғ, ү, ұ, қ, ө, һ) дұрыс қолдан.
5. ЖАУАПТЫ ҚАТАҢ ТҮРДЕ МЫНА JSON ФОРМАТЫНДА ҚАЙТАР:
{
  "user_transcript": "Оқушының сөйлеген сөзінің толық мәтіні",
  "ai_response": "AI көмекшінің сандары сөзбен жазылған, таза қазақша жауабы",
  "emotion": "happy"
}
(emotion үшін тек: "happy", "thinking", "speaking" мәндерінің бірін таңда)."""


# Сандарды қазақша сөзге айналдыру сөздігі (акцент пен қателіктердің алдын алу кепілдігі)
_ONES = {
    0: "нөл", 1: "бір", 2: "екі", 3: "үш", 4: "төрт", 5: "бес",
    6: "алты", 7: "жеті", 8: "сегіз", 9: "тоғыз",
}
_TENS = {
    10: "он", 20: "жиырма", 30: "отыз", 40: "қырық", 50: "елу",
    60: "алпыс", 70: "жетпіс", 80: "сексен", 90: "тоқсан",
}
_ORDINALS = {
    1: "бірінші", 2: "екінші", 3: "үшінші", 4: "төртінші", 5: "бесінші",
    6: "алтыншы", 7: "жетінші", 8: "сегізінші", 9: "тоғызыншы", 10: "оныншы",
    11: "он бірінші", 12: "он екінші",
}


def _int_to_kazakh_words(n: int) -> str:
    """Бүтін санды қазақша сөзге айналдырады (0-ден 999999-ға дейін)."""
    if n in _ONES:
        return _ONES[n]
    if n < 100:
        ten = (n // 10) * 10
        rem = n % 10
        return f"{_TENS.get(ten, '')} {_ONES.get(rem, '')}".strip()
    if n < 1000:
        hundred = n // 100
        rem = n % 100
        prefix = f"{_ONES.get(hundred, '')} жүз" if hundred > 1 else "жүз"
        return f"{prefix} {_int_to_kazakh_words(rem)}".strip() if rem else prefix
    if n < 1000000:
        thousand = n // 1000
        rem = n % 1000
        prefix = f"{_int_to_kazakh_words(thousand)} мың"
        return f"{prefix} {_int_to_kazakh_words(rem)}".strip() if rem else prefix
    return str(n)


def kazakh_numbers_to_words(text: str) -> str:
    """
    Мәтінде кездейсоқ кездескен сандарды автоматты түрде қазақша сөзге айналдырады.
    Мысалы: '7-сынып' -> 'жетінші сынып', '10' -> 'он'.
    """
    if not text:
        return ""

    # Реттік сандар: 7-сынып, 5-ші, т.б.
    def replace_ordinal(m: re.Match) -> str:
        num = int(m.group(1))
        suffix = m.group(2) or ""
        word = _ORDINALS.get(num, f"{_int_to_kazakh_words(num)}-інші")
        return f"{word} {suffix}".strip()

    text = re.sub(r"\b(\d+)-(?:сынып|ші|ншы|ыншы|інші)\b", replace_ordinal, text, flags=re.IGNORECASE)

    # Қарапайым бүтін сандар: 10, 25, 2024
    def replace_number(m: re.Match) -> str:
        num_str = m.group(0)
        try:
            num = int(num_str)
            if num <= 999999:
                return _int_to_kazakh_words(num)
        except Exception:
            pass
        return num_str

    text = re.sub(r"\b\d+\b", replace_number, text)
    return text


def clean_voice_text(text: str) -> str:
    """
    Дауыспен оқуға оңтайландыру:
    Сандарды сөзге айналдырады, markdown және эмодзи белгілерін алып тастайды.
    """
    if not text:
        return ""

    # 1. Сандарды сөзге айналдыру
    text = kazakh_numbers_to_words(text)

    # 2. Markdown және арнайы белгілерді өшіру
    cleaned = re.sub(r"[\*#_`~>\[\]\(\)\{\}\\\/]", "", text)
    # Сұрақ/леп белгілерін дұрыс паузаларға айналдыру
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
                "parts": [{"text": CHATGPT_KAZAKH_VOICE_SYSTEM_PROMPT}]
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
                                "Мына аудиодағы оқушының қазақша сөзін тыңдап, оған дәл ChatGPT сияқты "
                                "табиғи ауызекі қазақ тілінде сандарды сөзбен жаза отырып, қысқа әрі жылы жауап бер. "
                                "Нәтижені қатаң түрде JSON түрінде қайтар."
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
                                logger.warning("JSON parse failed, regex extraction: %s", parse_err)
                                match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                                if match:
                                    parsed = json.loads(match.group(0))
                                    return (
                                        clean_voice_text(parsed.get("user_transcript", "")),
                                        clean_voice_text(parsed.get("ai_response", "Сәлем, достым!")),
                                        parsed.get("emotion", "happy"),
                                    )
                                return "Сөйлеген сөз", clean_voice_text(raw_text), "happy"
                    else:
                        logger.warning("Gemini model %s returned HTTP %s: %s", model_name, resp.status_code, resp.text[:160])
                except Exception as model_err:
                    logger.warning("Error with Gemini model %s: %s", model_name, model_err)

    # 2. Резервтік Groq / OpenAI LLM арқылы орындау (егер Gemini кілті болмаса)
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
    """Резервтік Whisper STT."""
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
    """Резервтік ChatGPT-стиліндегі LLM жауабы."""
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if openai_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_key)
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": CHATGPT_KAZAKH_VOICE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_text},
                ],
                max_tokens=150,
            )
            text = clean_voice_text(resp.choices[0].message.content or "")
            return text or "Сәлем, достым! Сұрағың өте қызық екен.", "happy"
        except Exception as exc:
            logger.warning("OpenAI fallback error: %s", exc)

    return "Сәлем, достым! Сені тыңдап тұрмын.", "happy"


# ==============================================================================
# OpenAI Audio Speech TTS (gpt-4o-mini-tts / coral / nova)
# ==============================================================================
async def synthesize_speech_openai(
    text: str,
    voice: str | None = None,
    model: str | None = None,
) -> bytes:
    """
    OpenAI Audio Speech Text-to-Speech:
    OpenAI TTS сервисі арқылы (gpt-4o-mini-tts немесе tts-1 моделімен)
    қазақша таза мәтінді coral немесе nova дауысында табиғи адамның интонациясымен
    жоғары сапада MP3 форматында дыбыстайды.
    """
    cleaned_text = clean_voice_text(text)
    if not cleaned_text:
        cleaned_text = "Сәлем, достым!"

    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    active_voice = voice or os.getenv("OPENAI_TTS_VOICE", "coral")
    if active_voice not in {"coral", "nova", "alloy", "echo", "fable", "onyx", "shimmer", "sage", "ash"}:
        active_voice = "coral"

    candidate_models: list[str] = []
    configured_model = model or os.getenv("OPENAI_TTS_MODEL")
    if configured_model:
        candidate_models.append(configured_model)
    for m in ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"]:
        if m not in candidate_models:
            candidate_models.append(m)

    instructions_text = (
        "Қазақ тіліндегі төл дыбыстарды (ә, і, ң, ғ, ү, ұ, қ, ө, һ) таза әрі анық айтып, "
        "жылы әрі шынайы адам сияқты табиғи ауызекі интонациямен сөйле."
    )

    if openai_key:
        url = "https://api.openai.com/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            for tts_model in candidate_models:
                # 1. Алдымен instructions параметрімен тырысамыз (gpt-4o-mini-tts үшін)
                payload_with_instructions = {
                    "model": tts_model,
                    "voice": active_voice,
                    "input": cleaned_text,
                    "response_format": "mp3",
                    "speed": 1.0,
                    "instructions": instructions_text,
                }
                try:
                    resp = await client.post(url, headers=headers, json=payload_with_instructions)
                    if resp.status_code == 200 and resp.content:
                        logger.info("OpenAI TTS success with %s (%s, %d bytes)", tts_model, active_voice, len(resp.content))
                        return resp.content
                except Exception as exc:
                    logger.warning("OpenAI TTS error with instructions on %s: %s", tts_model, exc)

                # 2. Стандартты параметрлермен тырысамыз (егер instructions қолдамаса)
                payload_standard = {
                    "model": tts_model,
                    "voice": active_voice,
                    "input": cleaned_text,
                    "response_format": "mp3",
                    "speed": 1.0,
                }
                try:
                    resp = await client.post(url, headers=headers, json=payload_standard)
                    if resp.status_code == 200 and resp.content:
                        logger.info("OpenAI TTS success standard on %s (%s, %d bytes)", tts_model, active_voice, len(resp.content))
                        return resp.content
                    else:
                        logger.warning("OpenAI TTS %s returned HTTP %d: %s", tts_model, resp.status_code, resp.text[:120])
                except Exception as exc:
                    logger.warning("OpenAI TTS standard error on %s: %s", tts_model, exc)

    # 3. Сақтық көшірме: егер OPENAI_API_KEY болмаса немесе қате болса -> Edge-TTS қазақша дауысы
    logger.info("Falling back to Edge-TTS DauletNeural...")
    return await _synthesize_edge_tts_fallback(cleaned_text)


# Backward compatibility
synthesize_speech_elevenlabs = synthesize_speech_openai


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
