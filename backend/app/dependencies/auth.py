from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Header, HTTPException, status
from supabase import Client, create_client

import time

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
ENV_FILES = [ROOT_DIR / ".env", BACKEND_DIR / ".env"]

logger = logging.getLogger("bilimcorp.ai.auth")

_supabase_auth_client: Client | None = None
_supabase_service_client: Client | None = None

_TOKEN_CACHE: dict[str, tuple[str, str, float]] = {}
_USER_ROLE_CACHE: dict[str, tuple[str, float]] = {}

DEV_ENVS = {"local", "dev", "development", "test"}
PRODUCTION_LIKE_ENVS = {"prod", "production", "staging"}
MAX_AUTH_HEADER_LENGTH = 10_000
MAX_USER_ID_HEADER_LENGTH = 160
TOKEN_CACHE_TTL_SECONDS = 60.0
ROLE_CACHE_TTL_SECONDS = 60.0


def _load_environment() -> None:
    for env_file in ENV_FILES:
        if env_file.exists():
            load_dotenv(env_file, override=False)


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _clean_text(value: object, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _http_error(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> HTTPException:
    headers = {"WWW-Authenticate": "Bearer"} if status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN) else None
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


def _extract_metadata_role(user: object | None) -> str:
    if user is None:
        return "student"

    metadata = getattr(user, "user_metadata", None)
    if isinstance(user, dict):
        metadata = user.get("user_metadata")

    if isinstance(metadata, dict):
        role_val = _clean_text(metadata.get("role"), 40).lower()
        if role_val in {"student", "teacher", "parent", "head", "admin"}:
            return role_val

    return "student"


_load_environment()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# Detect cloud production platforms if APP_ENV was not explicitly specified
_inferred_env = "production" if any(os.getenv(k) for k in ("RENDER", "VERCEL", "FLY_ALLOC_ID", "KUBERNETES_SERVICE_HOST")) else "development"
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", _inferred_env)).strip().lower()

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


def get_supabase_service_client() -> Client | None:
    global _supabase_service_client

    if _supabase_service_client is not None:
        return _supabase_service_client

    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        try:
            _supabase_service_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            return _supabase_service_client
        except Exception:
            logger.exception("Failed to create Supabase service client")

    return None


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


def get_user_role(user_id: str, default_role: str = "student") -> str:
    clean_uid = _clean_text(user_id, 120)
    if not clean_uid:
        return default_role

    now = time.time()
    cached = _USER_ROLE_CACHE.get(clean_uid)
    if cached and cached[1] > now:
        return cached[0]

    resolved_role = default_role
    service_client = get_supabase_service_client()
    if service_client:
        try:
            res = (
                service_client.table("user_roles")
                .select("role")
                .eq("user_id", clean_uid)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            rows = getattr(res, "data", [])
            if rows and isinstance(rows, list) and isinstance(rows[0], dict):
                r = rows[0].get("role")
                if r in {"student", "teacher", "parent", "head", "admin"}:
                    resolved_role = r
        except Exception:
            logger.debug("Querying user_roles failed for user=%s", clean_uid, exc_info=True)

    _USER_ROLE_CACHE[clean_uid] = (resolved_role, now + ROLE_CACHE_TTL_SECONDS)
    return resolved_role


def resolve_user_from_bearer_token(token: str) -> tuple[str, str]:
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

    now = time.time()
    cached = _TOKEN_CACHE.get(token_value)
    if cached and cached[2] > now:
        return cached[0], cached[1]

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

    metadata_role = _extract_metadata_role(user)
    role = get_user_role(user_id, default_role=metadata_role)

    # Prune cache if it grows too large
    if len(_TOKEN_CACHE) > 1000:
        _TOKEN_CACHE.clear()

    _TOKEN_CACHE[token_value] = (user_id, role, now + TOKEN_CACHE_TTL_SECONDS)
    return user_id, role


def resolve_user_id_from_bearer_token(token: str) -> str:
    user_id, _ = resolve_user_from_bearer_token(token)
    return user_id


def get_current_user_with_role(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> tuple[str, str]:
    auth_value = _clean_text(authorization, MAX_AUTH_HEADER_LENGTH)

    if auth_value:
        token = extract_bearer_token(auth_value)
        return resolve_user_from_bearer_token(token)

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
        role = get_user_role(debug_user_id, default_role="admin")
        return debug_user_id, role

    raise _http_error(
        "Авторизация қажет.",
        status.HTTP_401_UNAUTHORIZED,
    )


def get_current_user_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    user_id, _ = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
    return user_id


class RoleChecker:
    def __init__(self, allowed_roles: set[str]):
        self.allowed_roles = allowed_roles

    def __call__(
        self,
        authorization: str | None = Header(default=None, alias="Authorization"),
        x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    ) -> str:
        user_id, role = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
        if role not in self.allowed_roles:
            logger.warning(
                "Access denied: user=%s with role=%s attempted action requiring %s",
                user_id,
                role,
                self.allowed_roles,
            )
            raise _http_error(
                f"Бұл әрекетке рұқсат жоқ. Қажетті рөл: {', '.join(sorted(self.allowed_roles))}.",
                status.HTTP_403_FORBIDDEN,
            )
        return user_id


def require_roles(*roles: str) -> RoleChecker:
    return RoleChecker(set(roles))


require_author_role = require_roles("admin")  # Мұғалім рөлі алынып тасталды: курс авторы тек админ.
require_admin_role = require_roles("admin")
