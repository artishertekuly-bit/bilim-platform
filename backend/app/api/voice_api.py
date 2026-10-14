from __future__ import annotations

import base64
import json
import logging
import urllib.parse
from typing import Any

from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import JSONResponse, Response

from ..dependencies.auth import (
    extract_bearer_token,
    resolve_user_id_from_bearer_token,
)
from ..services.voice_service import (
    generate_qwen_response,
    synthesize_speech_elevenlabs,
    transcribe_whisper,
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


@router.websocket("/ws")
@router.websocket("/stream")
async def voice_realtime_websocket(websocket: WebSocket):
    """
    GoPrep Architecture: Real-time Audio WebSocket Pipeline.
    1. Фронтенд MediaRecorder арқылы аудио ағынын жібереді.
    2. Whisper STT -> Qwen (жастар стилі) -> ElevenLabs TTS.
    3. Эмоциялармен (happy, thinking, speaking) фронтендке дыбыс пен мәтінді қайтарады.
    4. Supabase дерекқорына RLS саясатымен сақтайды.
    """
    await websocket.accept()
    logger.info("Voice Assistant WebSocket client connected")

    user_id: str | None = None
    session_id: str | None = None
    history: list[dict[str, str]] = []

    try:
        while True:
            message_data = await websocket.receive_json()
            msg_type = message_data.get("type", "")

            # 1. Қосылымды баптау (Init)
            if msg_type == "init":
                user_id = message_data.get("user_id") or user_id
                session_id = message_data.get("session_id") or session_id
                auth_token = message_data.get("auth_token")
                if auth_token and not user_id:
                    try:
                        user_id = resolve_user_id_from_bearer_token(auth_token)
                    except Exception:
                        pass

                await websocket.send_json({
                    "type": "status",
                    "state": "idle",
                    "message": "AI көмекші дайын",
                })
                continue

            # 2. Ping / Pong
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # 3. Аудио өңдеу (MediaRecorder chunk/utterance)
            elif msg_type == "audio":
                audio_b64 = message_data.get("audio_base64", "")
                if not audio_b64:
                    continue

                try:
                    audio_bytes = base64.b64decode(audio_b64)
                except Exception as b64_err:
                    await websocket.send_json({"type": "error", "message": f"Base64 оқу қатесі: {b64_err}"})
                    continue

                if len(audio_bytes) < 300:
                    # Дыбыс тым қысқа, елемеу
                    continue

                # 3.1. Күй: Ойлану (Thinking)
                await websocket.send_json({"type": "status", "state": "thinking"})

                # 3.2. Whisper Speech-to-Text
                try:
                    user_transcript = await transcribe_whisper(
                        audio_bytes=audio_bytes,
                        filename="recording.webm",
                        language="kk",
                    )
                except Exception as stt_err:
                    logger.warning("STT transcription error: %s", stt_err)
                    await websocket.send_json({
                        "type": "error",
                        "message": "Дауысты тану кезінде қате орын алды. Қайта сөйлеп көріңізші.",
                    })
                    await websocket.send_json({"type": "status", "state": "listening"})
                    continue

                if not user_transcript.strip():
                    await websocket.send_json({"type": "status", "state": "listening"})
                    continue

                # Танылған мәтінді фронтендке жіберу
                await websocket.send_json({
                    "type": "user_transcript",
                    "text": user_transcript,
                })

                # 3.3. Qwen LLM жауабы (жастар стилінде)
                try:
                    ai_reply, emotion = await generate_qwen_response(
                        user_text=user_transcript,
                        history=history[-4:],
                    )
                except Exception as llm_err:
                    logger.warning("LLM response error: %s", llm_err)
                    ai_reply = "Сұрағың керемет екен! Тағы бір рет нақтылап көрейікші."
                    emotion = "happy"

                history.append({"role": "user", "content": user_transcript})
                history.append({"role": "assistant", "content": ai_reply})

                # AI жауабы мен эмоциясын фронтендке жіберу
                await websocket.send_json({
                    "type": "ai_response",
                    "text": ai_reply,
                    "emotion": emotion,
                })

                # 3.4. Күй: Сөйлеу (Speaking)
                await websocket.send_json({"type": "status", "state": "speaking", "emotion": emotion})

                # 3.5. ElevenLabs қазақша TTS
                try:
                    mp3_bytes = await synthesize_speech_elevenlabs(ai_reply)
                    mp3_b64 = base64.b64encode(mp3_bytes).decode("ascii")

                    await websocket.send_json({
                        "type": "audio",
                        "audio_base64": mp3_b64,
                        "mime": "audio/mpeg",
                        "emotion": emotion,
                    })
                except Exception as tts_err:
                    logger.warning("TTS audio generation error: %s", tts_err)
                    await websocket.send_json({
                        "type": "error",
                        "message": "Дыбыстау кезінде қате болды, бірақ мәтінді оқи аласыз.",
                    })

                # 3.6. Supabase дерекқорына сақтау (RLS)
                record_id = save_voice_dialog_record(
                    user_id=user_id,
                    session_id=session_id,
                    user_transcript=user_transcript,
                    ai_response=ai_reply,
                    emotion=emotion,
                    language="kk",
                )
                if record_id:
                    await websocket.send_json({"type": "saved", "id": record_id})

            # 4. Сөзді бөлу (Barge-in / Interrupt)
            elif msg_type == "interrupt":
                logger.info("Voice Assistant interrupted by user")
                await websocket.send_json({"type": "status", "state": "listening"})

    except WebSocketDisconnect:
        logger.info("Voice Assistant WebSocket client disconnected")
    except Exception as exc:
        logger.exception("Voice Assistant WebSocket unexpected error: %s", exc)


@router.post("/interact")
async def voice_interact_rest(
    audio: UploadFile = File(..., description="Пайдаланушы жазған аудио файл (webm, mp3, wav)"),
    session_id: str | None = Form(None),
    history_json: str | None = Form(None),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """
    REST API нұсқасы (WebSocket қолжетімсіз болған кездегі сақтық жол).
    """
    audio_bytes = await audio.read()
    if not audio_bytes or len(audio_bytes) < 300:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Бос аудио файл жіберілді.")

    user_id = _extract_user_id(authorization, x_user_id)

    # 1. Whisper STT
    user_transcript = await transcribe_whisper(audio_bytes=audio_bytes, filename=audio.filename or "recording.webm")

    # 2. History parse
    parsed_history: list[dict[str, str]] = []
    if history_json:
        try:
            items = json.loads(history_json)
            if isinstance(items, list):
                for item in items[-4:]:
                    if isinstance(item, dict) and item.get("content"):
                        parsed_history.append({
                            "role": str(item.get("role", "user")),
                            "content": str(item.get("content", "")),
                        })
        except Exception:
            pass

    # 3. Qwen LLM
    ai_reply, emotion = await generate_qwen_response(user_text=user_transcript, history=parsed_history)

    # 4. ElevenLabs TTS
    mp3_bytes = await synthesize_speech_elevenlabs(ai_reply)

    # 5. Supabase RLS Save
    record_id = save_voice_dialog_record(
        user_id=user_id,
        session_id=session_id,
        user_transcript=user_transcript,
        ai_response=ai_reply,
        emotion=emotion,
    )

    return JSONResponse(
        content={
            "status": "success",
            "user_transcript": user_transcript,
            "ai_response": ai_reply,
            "emotion": emotion,
            "audio_base64": base64.b64encode(mp3_bytes).decode("ascii"),
            "audio_mime": "audio/mpeg",
            "record_id": record_id,
        }
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
