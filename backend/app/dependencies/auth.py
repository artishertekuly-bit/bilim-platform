from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Header, HTTPException, status
from supabase import Client, create_client

ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"

logger = logging.getLogger("bilimcorp.ai.auth")

_supabase_auth_client: Client | None = None

DEV_ENVS = {"local", "dev", "development", "test"}
PRODUCTION_LIKE_ENVS = {"prod", "production", "staging"}
MAX_AUTH_HEADER_LENGTH = 10_000
MAX_USER_ID_HEADER_LENGTH = 160


def _load_environment() -> None:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _clean_text(value: object, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _http_error(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> HTTPException:
    headers = {"WWW-Authenticate": "Bearer"} if status_code == status.HTTP_401_UNAUTHORIZED else None
    return HTTPException(status_code=status_code, detail=message, headers=headers)


def _is_local_like_env(value: str) -> bool:
    return value in DEV_ENVS


def _is_production_like_env(value: str) -> bool:
    return value in PRODUCTION_LIKE_ENVS


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _extract_user_id_from_supabase_user(user: object | None) -> str:
    if user is None:
        return ""

    if isinstance(user, dict):
        return _clean_text(user.get("id"), 120)

    return _clean_text(getattr(user, "id", None), 120)


_load_environment()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()

ALLOW_DEBUG_USER_ID_FALLBACK = _is_truthy(
    os.getenv("ALLOW_DEBUG_USER_ID_FALLBACK", "false")
)

DEBUG_USER_ID_FALLBACK_ENABLED = (
    ALLOW_DEBUG_USER_ID_FALLBACK
    and _is_local_like_env(APP_ENV)
    and not _is_production_like_env(APP_ENV)
)

if ALLOW_DEBUG_USER_ID_FALLBACK and not DEBUG_USER_ID_FALLBACK_ENABLED:
    logger.warning(
        "ALLOW_DEBUG_USER_ID_FALLBACK is configured, but debug fallback is disabled for env=%s.",
        APP_ENV,
    )


def get_auth_runtime_info() -> dict[str, object]:
    """
    Safe health/debug information.
    Never returns secrets or token values.
    """
    return {
        "supabase_auth_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY),
        "debug_user_id_fallback": DEBUG_USER_ID_FALLBACK_ENABLED,
        "debug_user_id_fallback_configured": ALLOW_DEBUG_USER_ID_FALLBACK,
        "debug_user_id_header_allowed": DEBUG_USER_ID_FALLBACK_ENABLED,
        "env": APP_ENV,
        "production_like_env": _is_production_like_env(APP_ENV),
        "auth_mode": "bearer_token_required"
        if not DEBUG_USER_ID_FALLBACK_ENABLED
        else "bearer_token_or_local_debug_header",
    }


def get_supabase_auth_client() -> Client:
    global _supabase_auth_client

    if _supabase_auth_client is not None:
        return _supabase_auth_client

    if not SUPABASE_URL:
        raise _http_error(
            "Supabase auth конфигурациясы толық емес: SUPABASE_URL қажет.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if not SUPABASE_ANON_KEY:
        raise _http_error(
            "Supabase auth конфигурациясы толық емес: SUPABASE_ANON_KEY қажет.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    _supabase_auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _supabase_auth_client


def extract_bearer_token(authorization: str | None) -> str:
    auth_value = _clean_text(authorization, MAX_AUTH_HEADER_LENGTH)

    if not auth_value:
        raise _http_error(
            "Authorization header қажет.",
            status.HTTP_401_UNAUTHORIZED,
        )

    if len(auth_value) >= MAX_AUTH_HEADER_LENGTH:
        raise _http_error(
            "Authorization header тым ұзын.",
            status.HTTP_401_UNAUTHORIZED,
        )

    parts = auth_value.split(None, 1)

    if len(parts) != 2:
        raise _http_error(
            "Authorization header Bearer token форматында болуы керек.",
            status.HTTP_401_UNAUTHORIZED,
        )

    scheme, token = parts

    if scheme.lower() != "bearer" or not token.strip():
        raise _http_error(
            "Authorization header Bearer token форматында болуы керек.",
            status.HTTP_401_UNAUTHORIZED,
        )

    return token.strip()


def resolve_user_id_from_bearer_token(token: str) -> str:
    token_value = _clean_text(token, MAX_AUTH_HEADER_LENGTH)

    if not token_value:
        raise _http_error(
            "Bearer token бос болмауы керек.",
            status.HTTP_401_UNAUTHORIZED,
        )

    if len(token_value) >= MAX_AUTH_HEADER_LENGTH:
        raise _http_error(
            "Bearer token тым ұзын.",
            status.HTTP_401_UNAUTHORIZED,
        )

    try:
        supabase = get_supabase_auth_client()
        user_response = supabase.auth.get_user(token_value)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Supabase auth get_user failed")
        raise _http_error(
            "Пайдаланушы токенін тексеру кезінде серверлік қате пайда болды.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    user = getattr(user_response, "user", None)
    user_id = _extract_user_id_from_supabase_user(user)

    if not user_id:
        raise _http_error(
            "Жарамсыз немесе мерзімі өткен token.",
            status.HTTP_401_UNAUTHORIZED,
        )

    if not _is_valid_uuid(user_id):
        logger.warning("Supabase auth returned non-UUID user id.")
        raise _http_error(
            "Жарамсыз пайдаланушы идентификаторы.",
            status.HTTP_401_UNAUTHORIZED,
        )

    return user_id


def get_current_user_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    auth_value = _clean_text(authorization, MAX_AUTH_HEADER_LENGTH)

    if auth_value:
        token = extract_bearer_token(auth_value)
        return resolve_user_id_from_bearer_token(token)

    debug_user_id = _clean_text(x_user_id, MAX_USER_ID_HEADER_LENGTH)

    if debug_user_id and not DEBUG_USER_ID_FALLBACK_ENABLED:
        logger.warning(
            "Ignored X-User-Id fallback header because debug fallback is disabled. env=%s",
            APP_ENV,
        )

    if DEBUG_USER_ID_FALLBACK_ENABLED and debug_user_id:
        if not _is_valid_uuid(debug_user_id):
            raise _http_error(
                "X-User-Id debug fallback UUID форматында болуы керек.",
                status.HTTP_401_UNAUTHORIZED,
            )

        logger.warning(
            "Using insecure debug X-User-Id fallback for user_id=%s in env=%s",
            debug_user_id,
            APP_ENV,
        )
        return debug_user_id

    raise _http_error(
        "Авторизация қажет.",
        status.HTTP_401_UNAUTHORIZED,
    )
