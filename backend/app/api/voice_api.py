from __future__ import annotations

import base64
import logging
from typing import Any

from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse

from ..dependencies.auth import (
    extract_bearer_token,
    resolve_user_id_from_bearer_token,
)
from ..services.voice_service import (
    process_voice_with_gemini,
    synthesize_speech_openai,
)
from ..services.voice_storage import (
    get_user_voice_history,
    save_voice_dialog_record,
)

logger = logging.getLogger("bilimcorp.voice.api")

router = APIRouter(prefix="/api/voice", tags=["Voice Assistant"])

MAX_AUDIO_SIZE = 15 * 1024 * 1024  # 15 MB


def _extract_user_id(authorization: str | None, x_user_id: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        try:
            token = extract_bearer_token(authorization)
            uid = resolve_user_id_from_bearer_token(token)
            if uid:
                return uid
        except Exception:
            pass
    if x_user_id and len(x_user_id.strip()) > 10:
        return x_user_id.strip()
    return None


@router.post("/interact")
@router.post("/chat")
async def voice_interact_gemini(
    audio: UploadFile = File(..., description="Пайдаланушы жазған толық аудио файл (webm, mp3, wav)"),
    session_id: str | None = Form(None),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """
    Тікелей Gemini 2.5 Flash мультимодальды аудио өңдеу құбыры:
    1. Фронтендтен MediaRecorder арқылы жиналған толық аудио файлды қабылдайды.
    2. Ешқандай бөлек STT қажет етпей, тікелей Gemini 2.5 Flash моделіне аудио күйінде береді.
    3. Gemini аудионы тыңдап (user_transcript) және қазақша жауабын (ai_response) бірге қайтарады.
    4. ElevenLabs (немесе Edge-TTS) арқылы сапалы MP3 дыбыс дайындайды.
    5. Supabase дерекқорына RLS саясатымен сақтап, фронтендке қайтарады.
    """
    try:
        audio_bytes = await audio.read()
        if not audio_bytes or len(audio_bytes) < 300:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Дыбыс жазылмады немесе файл тым қысқа. Қайта сөйлеп көріңізші.",
            )

        if len(audio_bytes) > MAX_AUDIO_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Аудио файл тым үлкен (15 МБ-тан аспауы керек).",
            )

        user_id = _extract_user_id(authorization, x_user_id)
        filename = audio.filename or "recording.webm"
        content_type = audio.content_type or "audio/webm"

        logger.info("Processing voice interaction via Gemini 2.5 Flash (size=%d bytes, file=%s, user=%s)", len(audio_bytes), filename, user_id)

        # 1. Тікелей Gemini 2.5 Flash мультимодальды аудио өңдеу
        user_transcript, ai_reply, emotion = await process_voice_with_gemini(
            audio_bytes=audio_bytes,
            filename=filename,
            mime_type=content_type,
        )

        if not ai_reply:
            ai_reply = "Сәлем, достым! Сені толық түсінбей қалдым, қайталап айтып жібересің бе?"
            emotion = "happy"

        # 2. OpenAI Audio Speech TTS (gpt-4o-mini-tts / coral / nova)
        try:
            mp3_bytes = await synthesize_speech_openai(ai_reply)
            mp3_b64 = base64.b64encode(mp3_bytes).decode("ascii")
        except Exception as tts_err:
            logger.warning("OpenAI TTS generation error: %s", tts_err)
            mp3_b64 = ""

        # 3. Supabase RLS арқылы тарихқа сақтау
        record_id = save_voice_dialog_record(
            user_id=user_id,
            session_id=session_id,
            user_transcript=user_transcript or "Аудио хабарлама",
            ai_response=ai_reply,
            emotion=emotion,
        )

        return JSONResponse(
            content={
                "status": "success",
                "user_transcript": user_transcript,
                "ai_response": ai_reply,
                "emotion": emotion,
                "audio_base64": mp3_b64,
                "audio_mime": "audio/mpeg",
                "record_id": record_id,
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Voice interaction unexpected error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc) or "Аудионы өңдеу кезінде күтпеген қате орын алды.",
        )


@router.get("/history")
async def voice_history_endpoint(
    limit: int = Query(20, ge=1, le=100),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """Пайдаланушының сұхбат тарихын алу (RLS)."""
    user_id = _extract_user_id(authorization, x_user_id)
    if not user_id:
        return {"items": []}
    return {"items": get_user_voice_history(user_id=user_id, limit=limit)}
