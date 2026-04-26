from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import Client, create_client

ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"

logger = logging.getLogger("bilimcorp.ai.auth")

_supabase_auth_client: Client | None = None


def _load_environment() -> None:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _clean_text(value: object, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit] if limit else text


def _http_error(message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


_load_environment()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()

ALLOW_DEBUG_USER_ID_FALLBACK = _is_truthy(
    os.getenv("ALLOW_DEBUG_USER_ID_FALLBACK", "false")
)

DEBUG_USER_ID_FALLBACK_ENABLED = ALLOW_DEBUG_USER_ID_FALLBACK and APP_ENV in {
    "local",
    "dev",
    "development",
    "test",
}


def get_supabase_auth_client() -> Client:
    global _supabase_auth_client

    if _supabase_auth_client is not None:
        return _supabase_auth_client

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise _http_error(
            "Supabase auth конфигурациясы табылмады. SUPABASE_URL және SUPABASE_ANON_KEY қажет.",
            500,
        )

    _supabase_auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _supabase_auth_client


def extract_bearer_token(authorization: str | None) -> str:
    auth_value = _clean_text(authorization, 4000)

    if not auth_value:
        raise _http_error("Authorization header қажет", 401)

    scheme, _, token = auth_value.partition(" ")

    if scheme.lower() != "bearer" or not token.strip():
        raise _http_error("Authorization Bearer token форматында болуы керек", 401)

    return token.strip()


def resolve_user_id_from_bearer_token(token: str) -> str:
    try:
        supabase = get_supabase_auth_client()
        user_response = supabase.auth.get_user(token)
    except HTTPException:
        raise
    except Exception:
        logger.exception("supabase auth get_user failed")
        raise _http_error(
            "Пайдаланушы токенін тексеру кезінде серверлік қате пайда болды",
            500,
        )

    user = getattr(user_response, "user", None)
    user_id = _clean_text(getattr(user, "id", None), 120)

    if not user_id:
        raise _http_error("Жарамсыз немесе мерзімі өткен токен", 401)

    return user_id


def get_current_user_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    if authorization:
        token = extract_bearer_token(authorization)
        return resolve_user_id_from_bearer_token(token)

    if DEBUG_USER_ID_FALLBACK_ENABLED:
        debug_user_id = _clean_text(x_user_id, 120)

        if debug_user_id:
            logger.warning(
                "Using insecure debug X-User-Id fallback for user_id=%s in env=%s",
                debug_user_id,
                APP_ENV,
            )
            return debug_user_id

    raise _http_error("Авторизация қажет", 401)