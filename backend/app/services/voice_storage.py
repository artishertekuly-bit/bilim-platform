from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

logger = logging.getLogger("bilimcorp.voice.storage")

VOICE_TABLE = "voice_dialog_history"


def save_voice_dialog_record(
    *,
    user_id: str | None,
    session_id: str | None,
    user_transcript: str,
    ai_response: str,
    emotion: str = "happy",
    audio_url: str | None = None,
    language: str = "kk",
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """
    Сақтайды аудио сұхбат жазбасын Supabase `voice_dialog_history` кестесіне.
    RLS саясатына сәйкес user_id бойынша қауіпсіз жазылады.
    Егер Supabase кестесі әлі қосылмаған болса, үдерісті үзбей ескерту жазады.
    """
    if not user_transcript.strip() or not ai_response.strip():
        return None

    try:
        from ..ai_storage import _get_supabase
        supabase = _get_supabase()

        record_id = str(uuid4())
        payload = {
            "id": record_id,
            "user_id": user_id if (user_id and len(user_id) > 10) else None,
            "session_id": session_id or f"sess_{uuid4().hex[:12]}",
            "user_transcript": user_transcript.strip(),
            "ai_response": ai_response.strip(),
            "emotion": emotion or "happy",
            "audio_url": audio_url,
            "language": language or "kk",
            "metadata": metadata or {},
            "created_at": datetime.now(UTC).isoformat(),
        }

        resp = supabase.table(VOICE_TABLE).insert(payload).execute()
        logger.info("Voice dialog saved successfully (id=%s, user=%s)", record_id, user_id)
        return record_id
    except Exception as exc:
        logger.warning("Could not persist to voice_dialog_history: %s", exc)
        return None


def get_user_voice_history(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """
    Пайдаланушының алдыңғы дауыстық сұрақ-жауап тарихын қайтарады (RLS сәйкес).
    """
    if not user_id:
        return []

    try:
        from ..ai_storage import _get_supabase
        supabase = _get_supabase()
        response = (
            supabase.table(VOICE_TABLE)
            .select("id, session_id, user_transcript, ai_response, emotion, language, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []
    except Exception as exc:
        logger.warning("Failed to fetch voice dialog history: %s", exc)
        return []
