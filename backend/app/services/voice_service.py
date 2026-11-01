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

# Сөйлесу манерасының (стилінің) нұсқаулықтары
VOICE_MANNER_RULES: dict[str, str] = {
    "modern": (
        "MANNER (Қазіргі заманға сай / Modern): Speak in a crisp, smart, contemporary, "
        "and lively modern assistant tone. Be clear, energetic, and concise without filler words."
    ),
    "warm": (
        "MANNER (Жылы / Warm & Gentle): Speak in a very warm, gentle, caring, and encouraging tone, "
        "like a kind older sibling or mentor. Use supportive expressions (e.g. in Kazakh: 'Жарайсың, достым', "
        "'Уайымдама, бірге шешеміз') while keeping the answer concise."
    ),
    "strict": (
        "MANNER (Қатты / Strict & Demanding): Speak in a firm, disciplined, direct, no-nonsense teacher/coach tone. "
        "Skip small talk, demand focus and discipline, state the exact rule or fact straight to the point "
        "(e.g. in Kazakh: 'Мұқият тыңда', 'Нақты ережені есте сақта')."
    ),
    "youth": (
        "MANNER (Жастарша / Youth & Peer): Speak in a relaxed, upbeat, relatable modern youth/student vibe, "
        "like a cool classmate explaining a topic simply and effortlessly (e.g. in Kazakh: 'Ой, бұл оп-оңай ғой!', "
        "'Қара, былай істейміз, досым')."
    ),
    "mature": (
        "MANNER (Үлкендерше / Wise & Mature): Speak in a calm, dignified, thoughtful, and wise elder/professor tone. "
        "Use rich, respectful, well-weighed phrasing (e.g. in Kazakh: 'Байыппен қарасақ, шәкіртім', 'Мұның мәнісі мынада')."
    ),
}


def build_realtime_instructions(manner: str = "modern") -> str:
    manner_key = (manner or "modern").strip().lower()
    manner_rule = VOICE_MANNER_RULES.get(manner_key, VOICE_MANNER_RULES["modern"])
    return f"""You are Sana, the voice assistant of "Bilim Platform", an online learning platform for school students in Kazakhstan.

LANGUAGE (most important rule):
- Always reply in the SAME language the student just spoke. Kazakh -> answer in Kazakh. Russian -> answer in Russian. English -> answer in English. Any other language -> answer in that language.
- If the student switches language, switch with them immediately.
- If the language is unclear, answer in Kazakh.
- Kazakh is NOT Uzbek, Kyrgyz or Turkish. When speaking Kazakh, use only pure, natural modern Kazakh with correct sounds (ә, ө, ү, ұ, қ, ғ, ң, і, һ) and never mix in Uzbek, Kyrgyz or Russian words.

{manner_rule}

NOISE & LENGTH RULES:
- If the audio input is just background noise, breathing, a cough, or silence with no clear words, do NOT make up a topic — simply ask briefly in Kazakh "Қайталап жіберші, естілмей қалды" or stay brief.
- Answer short and to the point: 1-2 short sentences, about 25 words max. Never give long lectures.
- If the topic really needs more, give the key point first, then ask "Толығырақ айтайын ба?" (or the same question in the student's language).
- Speak numbers as words in the student's language (Kazakh: 5 -> бес, 2026 -> екі мың жиырма алты).
- Plain speech only: no emojis, no markdown, no lists, no special symbols."""


def build_free_system_prompt(manner: str = "modern") -> str:
    manner_key = (manner or "modern").strip().lower()
    manner_rule = VOICE_MANNER_RULES.get(manner_key, VOICE_MANNER_RULES["modern"])
    return f"""You are Sana, the voice assistant of "Bilim Platform", an online learning platform for school students in Kazakhstan.

CRITICAL RULES:
1. REPLY IN THE SAME LANGUAGE THE STUDENT SPOKE:
   - Kazakh -> reply in pure, natural modern Kazakh (never mix in Uzbek, Kyrgyz, or Russian words; use correct letters ә, і, ң, ғ, ү, ұ, қ, ө, һ).
   - Russian -> reply in natural modern Russian.
   - English -> reply in natural modern English.
   - If the audio is unclear or very short, default to Kazakh.
2. SPEAKING MANNER:
   {manner_rule}
3. SHORT AND TO THE POINT:
   - Keep `ai_response` to 1-2 short sentences (maximum 25-30 words). Do not give long lectures or repeat the question.
4. TEXT FOR SPEECH (TTS):
   - Write all numbers as words in the reply language (e.g. in Kazakh: "5" -> "бес", "2026" -> "екі мың жиырма алты"; in Russian: "5" -> "пять").
   - Never use markdown (*, #, -), bullet lists, or emojis. Plain spoken sentences only.
5. RETURN STRICT JSON ONLY:
{{
  "user_transcript": "Exact transcription of what the student said in their language",
  "ai_response": "Short 1-2 sentence spoken reply in the same language and requested manner",
  "emotion": "happy",
  "language": "kk"
}}
("emotion" must be "happy", "thinking", or "speaking"; "language" must be "kk", "ru", or "en")."""


OPENAI_REALTIME_KAZAKH_INSTRUCTIONS = build_realtime_instructions("modern")
CHATGPT_KAZAKH_VOICE_SYSTEM_PROMPT = build_free_system_prompt("modern")


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
    Қазақша мәтін болса сандарды сөзге айналдырады, markdown және эмодзи белгілерін алып тастайды.
    """
    if not text:
        return ""

    # 1. Егер мәтінде қазақ әріптері болса (немесе латын/орыс емес болса), сандарды қазақша сөзге айналдыру
    if re.search(r"[әғқңөұүһіӘҒҚҢӨҰҮҺІ]", text):
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
    manner: str = "modern",
) -> tuple[str, str, str]:
    """
    Multimodal Gemini 2.5 Flash Pipeline (+ OpenAI Whisper/GPT-4o-mini fallback):
    Аудионы тыңдап, оқушы қай тілде сөйлесе, сол тілде қысқа әрі нақты жауап қайтарады.

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

    # 1. Егер Gemini API кілті болса -> Тікелей Gemini Flash арқылы мультимодальды өңдеу
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
        elif "mp4" in clean_mime or "m4a" in clean_mime:
            clean_mime = "audio/mp4"

        candidate_models: list[str] = []
        configured_model = (os.getenv("GEMINI_MODEL") or "").strip()
        if configured_model:
            candidate_models.append(configured_model)
        for m in DEFAULT_GEMINI_MODELS:
            if m not in candidate_models:
                candidate_models.append(m)

        manner_rule = VOICE_MANNER_RULES.get(manner, VOICE_MANNER_RULES["modern"])
        request_body = {
            "system_instruction": {
                "parts": [{"text": build_free_system_prompt(manner)}]
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
                                "Listen to the student's audio. Transcribe what they said in `user_transcript`, "
                                "and reply in `ai_response` in the EXACT SAME language they spoke (Kazakh, Russian, or English). "
                                f"Apply this speaking manner strictly: {manner_rule} "
                                "Keep the reply short (1-2 sentences, max 25-30 words). Return strict JSON only."
                            )
                        },
                    ],
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.35,
                "maxOutputTokens": 450,
            },
        }

        async with httpx.AsyncClient(timeout=35.0) as client:
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
                                    logger.info("Gemini Flash success: transcript='%s', reply='%s'", user_transcript[:50], ai_response[:50])
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
                                return "Аудио хабарлама", clean_voice_text(raw_text), "happy"
                    else:
                        logger.warning("Gemini model %s returned HTTP %s: %s", model_name, resp.status_code, resp.text[:160])
                except Exception as model_err:
                    logger.warning("Error with Gemini model %s: %s", model_name, model_err)

    # 2. Резервтік OpenAI Whisper + GPT-4o-mini (немесе Groq) арқылы орындау
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()

    if openai_key or groq_key:
        logger.info("Using OpenAI/Groq Whisper + LLM pipeline...")
        transcript = await _fallback_transcribe_whisper(audio_bytes, filename, mime_type)
        reply, emotion = await _fallback_llm_response(transcript, manner=manner)
        return transcript, reply, emotion

    raise RuntimeError(
        "GEMINI_API_KEY немесе OPENAI_API_KEY кілті табылмады! Бэкенд баптауларын тексеріңіз."
    )


async def _fallback_transcribe_whisper(
    audio_bytes: bytes,
    filename: str = "recording.webm",
    mime_type: str = "audio/webm",
) -> str:
    """Резервтік OpenAI Whisper-1 (немесе Groq) STT."""
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if openai_key:
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                files = {"file": (filename or "recording.webm", audio_bytes, mime_type or "audio/webm")}
                data = {"model": "whisper-1"}
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    files=files,
                    data=data,
                )
                if resp.status_code == 200:
                    text = (resp.json().get("text") or "").strip()
                    if text:
                        return clean_voice_text(text)
                else:
                    logger.warning("OpenAI Whisper STT returned %d: %s", resp.status_code, resp.text[:140])
        except Exception as exc:
            logger.warning("OpenAI Whisper fallback STT error: %s", exc)

    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if groq_key:
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=groq_key)
            resp = await client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model="whisper-large-v3-turbo",
                response_format="json",
            )
            return clean_voice_text(getattr(resp, "text", "") or "")
        except Exception as exc:
            logger.warning("Groq fallback STT error: %s", exc)

    return "Сәлем!"


async def _fallback_llm_response(user_text: str, manner: str = "modern") -> tuple[str, str]:
    """Резервтік OpenAI GPT-4o-mini жауабы (оқушы сөйлеген тілде және таңдалған манерада қысқа жауап)."""
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    manner_rule = VOICE_MANNER_RULES.get(manner, VOICE_MANNER_RULES["modern"])
    if openai_key:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are Sana, the voice assistant of Bilim Platform. "
                                    "Reply in the EXACT SAME language the user spoke (Kazakh -> pure natural Kazakh, "
                                    "Russian -> Russian, English -> English). Keep your answer to 1-2 short sentences "
                                    f"(max 25 words). Speaking manner: {manner_rule} "
                                    "Write numbers as words. Plain text only, no emojis or markdown."
                                ),
                            },
                            {"role": "user", "content": user_text},
                        ],
                        "temperature": 0.4,
                        "max_tokens": 120,
                    },
                )
                if resp.status_code == 200:
                    content = (
                        resp.json()
                        .get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )
                    text = clean_voice_text(content)
                    if text:
                        return text, "happy"
        except Exception as exc:
            logger.warning("OpenAI fallback LLM error: %s", exc)

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
        "Speak naturally, warmly, and clearly in the language of the input text. "
        "If the text is in Kazakh, pronounce Kazakh sounds (ә, і, ң, ғ, ү, ұ, қ, ө, һ) purely and naturally."
    )

    if openai_key:
        url = "https://api.openai.com/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            for tts_model in candidate_models:
                # 1. Егер модель gpt-4o-mini-tts болса, instructions параметрімен жібереміз
                if "gpt-4o" in tts_model:
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

                # 2. Стандартты параметрлермен (tts-1 / tts-1-hd немесе fallback)
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

    # 3. Сақтық көшірме: егер OPENAI_API_KEY болмаса немесе қате болса -> Edge-TTS дауысы
    logger.info("Falling back to Edge-TTS...")
    return await _synthesize_edge_tts_fallback(cleaned_text)


# Backward compatibility
synthesize_speech_elevenlabs = synthesize_speech_openai


async def _synthesize_edge_tts_fallback(text: str) -> bytes:
    """Сақтық көшірме: edge-tts арқылы мәтін тіліне сай MP3 дауыс дайындау."""
    try:
        import edge_tts
        if re.search(r"[әғқңөұүһіӘҒҚҢӨҰҮҺІ]", text):
            edge_voice = "kk-KZ-DauletNeural"
        elif re.search(r"[а-яёА-ЯЁ]", text):
            edge_voice = "ru-RU-SvetlanaNeural"
        else:
            edge_voice = "en-US-AriaNeural"
        communicate = edge_tts.Communicate(text, edge_voice, rate="-2%", pitch="+0Hz")
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        return buffer.getvalue()
    except Exception as exc:
        logger.exception("Fallback edge-tts synthesis failed: %s", exc)
        raise RuntimeError(f"Дыбыс генерациялау қатесі: {exc}") from exc
