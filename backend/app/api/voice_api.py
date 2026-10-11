from __future__ import annotations

import base64
import logging
import urllib.parse
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse, Response

from ..dependencies.auth import (
    extract_bearer_token,
    resolve_user_id_from_bearer_token,
)
from ..services.voice_service import (
    detect_language,
    generate_voice_llm_response,
    save_voice_chat_history_safe,
    synthesize_speech_edge_tts,
    transcribe_audio_groq,
)

logger = logging.getLogger("bilimcorp.ai.voice_api")

router = APIRouter(prefix="/api/voice", tags=["Voice Assistant"])

MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB limit


def _try_get_user_id(
    authorization: str | None = None,
    x_user_id: str | None = None,
) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        try:
            token = extract_bearer_token(authorization)
            return resolve_user_id_from_bearer_token(token)
        except Exception:
            pass
    if x_user_id and len(x_user_id.strip()) > 10:
        return x_user_id.strip()
    return None


@router.post("/assistant")
async def voice_assistant_endpoint(
    audio: UploadFile = File(..., description="Пайдаланушы жазған аудио файл (webm, mp3, wav, mp4, ogg)"),
    language: str = Form("kk", description="Сөйлеу тілі: 'kk' (қазақша) немесе 'ru' (орысша)"),
    system_prompt: str | None = Form(None, description="Қосымша жүйелік нұсқаулық"),
    return_format: str = Form("audio", description="'audio' (MP3 файл) немесе 'json' (base64 + мәтіндер)"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """
    Голосовой ИИ-помощник Bilim Platform:
    1. Принимает аудиозапись от микрофона (MediaRecorder).
    2. Распознает речь в текст через бесплатный Groq Whisper-large-v3.
    3. Генерирует лаконичный образовательный ответ через Groq LLM (Llama 3.3).
    4. Синтезирует естественную речь через edge-tts (қазақша / орысша) без нагрузки на сервер.
    5. Сохраняет историю в Supabase (voice_chat_history).
    6. Возвращает аудиофайл обратно (MP3) с распознанным текстом и ответом в заголовках, либо JSON.
    """
    if not audio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Аудио файл берілмеген.",
        )

    # 1. Чтение аудиофайла
    try:
        audio_bytes = await audio.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Аудио файлды оқу сәтсіз аяқталды: {exc}",
        )

    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Бос аудио файл жіберілді. Микрофонды тексеріп, қайта сөйлеңіз.",
        )

    if len(audio_bytes) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Аудио файл көлемі 15 МБ шегінен аспауы тиіс.",
        )

    filename = audio.filename or "recording.webm"
    user_id = _try_get_user_id(authorization, x_user_id)

    # 2. Распознавание речи через Groq Whisper
    try:
        user_transcript = await transcribe_audio_groq(
            audio_bytes=audio_bytes,
            filename=filename,
            language=language if language in {"kk", "ru", "en"} else None,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        logger.exception("Transcription failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Дауысты тану кезінде қате орын алды: {exc}",
        )

    if not user_transcript.strip():
        user_transcript = "..."
        ai_reply = (
            "Кешіріңіз, дауысыңыз естілмеді немесе танылмады. Микрофонды жақындатып, сұрағыңызды қайталап айтыңызшы."
            if language == "kk"
            else "Извините, не удалось расслышать голос. Пожалуйста, повторите ваш вопрос четче."
        )
    else:
        # 3. Определение языка и генерация ответа через Groq LLM
        active_lang = detect_language(user_transcript, fallback=language)
        try:
            ai_reply = await generate_voice_llm_response(
                user_text=user_transcript,
                system_prompt=system_prompt,
            )
        except Exception as exc:
            logger.exception("LLM generation failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Жауап дайындау кезінде қате орын алды: {exc}",
            )

    active_lang = detect_language(ai_reply, fallback=language)

    # 4. Синтез речи через edge-tts в MP3
    try:
        mp3_audio_bytes = await synthesize_speech_edge_tts(
            text=ai_reply,
            language=active_lang,
        )
    except Exception as exc:
        logger.exception("TTS synthesis failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Дауыстап оқу кезінде қате орын алды: {exc}",
        )

    # 5. Сохранение истории в Supabase (асинхронно-безопасно)
    if user_id:
        save_voice_chat_history_safe(
            user_id=user_id,
            user_transcript=user_transcript,
            ai_response=ai_reply,
            language=active_lang,
        )

    # 6. Возврат результата
    if return_format.lower() == "json":
        return JSONResponse(
            content={
                "status": "success",
                "user_transcript": user_transcript,
                "ai_reply": ai_reply,
                "language": active_lang,
                "audio_base64": base64.b64encode(mp3_audio_bytes).decode("ascii"),
                "audio_mime": "audio/mpeg",
            }
        )

    # По умолчанию возвращаем аудиофайл MP3 с заголовками
    encoded_transcript = urllib.parse.quote(user_transcript, safe="")
    encoded_reply = urllib.parse.quote(ai_reply, safe="")

    headers = {
        "Content-Disposition": 'inline; filename="assistant_reply.mp3"',
        "X-User-Transcript": encoded_transcript,
        "X-Ai-Reply": encoded_reply,
        "X-Reply-Language": active_lang,
        "Access-Control-Expose-Headers": "X-User-Transcript, X-Ai-Reply, X-Reply-Language, Content-Disposition",
    }

    return Response(
        content=mp3_audio_bytes,
        media_type="audio/mpeg",
        headers=headers,
    )


@router.post("/tts")
async def tts_endpoint(
    text: str = Form(..., description="Оқылатын мәтін"),
    language: str = Form("kk", description="'kk' немесе 'ru'"),
    voice: str | None = Form(None, description="Арнайы дауыс моделі"),
):
    """Тікелей мәтінді edge-tts арқылы MP3 аудиоға айналдыру."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="Мәтін бос болмауы керек.")

    try:
        audio_bytes = await synthesize_speech_edge_tts(
            text=text,
            language=language,
            voice=voice,
        )
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": 'inline; filename="tts_output.mp3"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/history")
async def get_voice_history_endpoint(
    limit: int = Query(20, ge=1, le=100),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """Ағымдағы пайдаланушының дауыстық сұрақ-жауап тарихын қайтарады."""
    user_id = _try_get_user_id(authorization, x_user_id)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Тарихты көру үшін авторизация қажет.",
        )

    try:
        from ..ai_storage import _get_supabase
        supabase = _get_supabase()
        response = (
            supabase.table("voice_chat_history")
            .select("id, user_transcript, ai_response, language, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"items": response.data or []}
    except Exception as exc:
        logger.warning("Failed to fetch voice history: %s", exc)
        return {"items": [], "warning": "Тарих кестесі әлі дайындалмаған немесе қолжетімсіз."}
