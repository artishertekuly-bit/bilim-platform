from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any

import httpx
from fastapi import (
    APIRouter,
    Body,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..dependencies.auth import (
    extract_bearer_token,
    resolve_user_id_from_bearer_token,
)
from ..services.voice_service import (
    CHATGPT_KAZAKH_VOICE_SYSTEM_PROMPT,
    OPENAI_REALTIME_KAZAKH_INSTRUCTIONS,
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

# OpenAI Realtime WebRTC моделдерінің басымдық тізімі
REALTIME_CANDIDATE_MODELS = [
    "gpt-4o-realtime-preview-2024-12-17",
    "gpt-4o-realtime-preview",
    "gpt-realtime",
    "gpt-realtime-2.1",
    "gpt-4o-mini-realtime-preview-2024-12-17",
    "gpt-4o-mini-realtime-preview",
]


class SaveVoiceTurnRequest(BaseModel):
    user_transcript: str
    ai_response: str
    session_id: str | None = None
    emotion: str = "happy"


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


@router.post("/realtime/session")
@router.post("/session")
async def create_openai_realtime_session(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """
    OpenAI Realtime API WebRTC сессиясы үшін уақытша (ephemeral) кілтті генерациялайды.
    Жаңа OpenAI GA талаптарына сәйкес /v1/realtime/client_secrets эндпоинтын қолданады
    (ескі /v1/realtime/sessions ресми түрде жабылған).
    """
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not openai_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Бэкендте OPENAI_API_KEY орнатылмаған. Render немесе .env файлына қосыңыз.",
        )

    voice = (os.getenv("OPENAI_REALTIME_VOICE") or "coral").strip()
    if voice not in {"coral", "nova", "alloy", "echo", "fable", "onyx", "shimmer", "sage", "ash"}:
        voice = "coral"

    configured_model = (os.getenv("OPENAI_REALTIME_MODEL") or "").strip()
    candidate_models: list[str] = []
    if configured_model:
        candidate_models.append(configured_model)
    for m in REALTIME_CANDIDATE_MODELS:
        if m not in candidate_models:
            candidate_models.append(m)

    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }

    url = "https://api.openai.com/v1/realtime/client_secrets"

    async with httpx.AsyncClient(timeout=30.0) as client:
        last_error_detail = ""
        for model_name in candidate_models:
            # Түрлі нұсқадағы payload түрлері
            payload_variants = [
                # 1. GA стандартты session нысаны (modalities жоқ)
                {
                    "session": {
                        "type": "realtime",
                        "model": model_name,
                        "instructions": OPENAI_REALTIME_KAZAKH_INSTRUCTIONS,
                        "voice": voice,
                        "input_audio_transcription": {
                            "model": "whisper-1",
                            "language": "kk",
                        },
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 600,
                        },
                    },
                },
                # 2. Тек instructions және voice қамтитын realtime session
                {
                    "session": {
                        "type": "realtime",
                        "model": model_name,
                        "instructions": OPENAI_REALTIME_KAZAKH_INSTRUCTIONS,
                        "voice": voice,
                    },
                },
                # 3. Жеңілдетілген session нысаны (instructions сақталған)
                {
                    "session": {
                        "model": model_name,
                        "instructions": OPENAI_REALTIME_KAZAKH_INSTRUCTIONS,
                        "voice": voice,
                    },
                },
                # 4. Тек модель көрсетілген session
                {
                    "session": {
                        "model": model_name,
                    },
                },
                # 5. Тікелей модель
                {
                    "model": model_name,
                },
            ]

            for payload in payload_variants:
                try:
                    logger.info("Requesting OpenAI Realtime token from %s (model=%s)", url, model_name)
                    resp = await client.post(url, headers=headers, json=payload)

                    if resp.status_code in {200, 201}:
                        data = resp.json()
                        client_secret = (
                            data.get("value")
                            or (data.get("client_secret") or {}).get("value")
                            or (data.get("client_secret") if isinstance(data.get("client_secret"), str) else None)
                            or data.get("key")
                        )
                        session_id = (
                            (data.get("session") or {}).get("id")
                            or data.get("id")
                            or f"sess_{int(time.time())}"
                        )

                        if client_secret:
                            logger.info(
                                "OpenAI Realtime session created: model=%s, session_id=%s",
                                model_name,
                                session_id,
                            )
                            return {
                                "status": "success",
                                "client_secret": client_secret,
                                "session_id": session_id,
                                "model": model_name,
                                "voice": voice,
                            }
                    else:
                        last_error_detail = resp.text
                        logger.warning(
                            "OpenAI client_secrets returned %d for %s: %s",
                            resp.status_code,
                            model_name,
                            resp.text[:160],
                        )
                except Exception as exc:
                    last_error_detail = str(exc)
                    logger.warning("OpenAI client_secrets exception for %s: %s", model_name, exc)

        # Соңғы сақтық: ешбір қосымша параметрсіз бос {} сұраныс жасап көру
        try:
            logger.info("Trying minimal empty client_secrets request...")
            resp = await client.post(url, headers=headers, json={})
            if resp.status_code in {200, 201}:
                data = resp.json()
                client_secret = (
                    data.get("value")
                    or (data.get("client_secret") or {}).get("value")
                    or (data.get("client_secret") if isinstance(data.get("client_secret"), str) else None)
                    or data.get("key")
                )
                session_id = (
                    (data.get("session") or {}).get("id")
                    or data.get("id")
                    or f"sess_{int(time.time())}"
                )
                if client_secret:
                    logger.info("OpenAI Realtime session created with default payload: %s", session_id)
                    return {
                        "status": "success",
                        "client_secret": client_secret,
                        "session_id": session_id,
                        "model": candidate_models[0],
                        "voice": voice,
                    }
            else:
                last_error_detail = resp.text
        except Exception as exc:
            last_error_detail = str(exc)

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI Realtime сессиясын бастау мүмкін болмады: {last_error_detail}",
        )


@router.post("/history/save")
async def save_voice_turn(
    payload: SaveVoiceTurnRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """WebRTC диалогының әрбір қадамын Supabase базасына RLS бойынша сақтайды."""
    user_id = _extract_user_id(authorization, x_user_id)
    record_id = save_voice_dialog_record(
        user_id=user_id,
        session_id=payload.session_id,
        user_transcript=payload.user_transcript,
        ai_response=payload.ai_response,
        emotion=payload.emotion,
    )
    return {"status": "success", "id": record_id}


@router.post("/interact")
@router.post("/chat")
async def voice_interact_gemini(
    audio: UploadFile = File(..., description="Пайдаланушы жазған толық аудио файл"),
    session_id: str | None = Form(None),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """Резервтік REST эндпоинты (егер WebRTC қолжетімсіз болса)."""
    try:
        audio_bytes = await audio.read()
        if not audio_bytes or len(audio_bytes) < 300:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Дыбыс жазылмады немесе файл тым қысқа.",
            )

        user_id = _extract_user_id(authorization, x_user_id)
        filename = audio.filename or "recording.webm"
        content_type = audio.content_type or "audio/webm"

        user_transcript, ai_reply, emotion = await process_voice_with_gemini(
            audio_bytes=audio_bytes,
            filename=filename,
            mime_type=content_type,
        )

        mp3_bytes = await synthesize_speech_openai(ai_reply)
        mp3_b64 = base64.b64encode(mp3_bytes).decode("ascii")

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc) or "Аудио өңдеуде қате болды.",
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
