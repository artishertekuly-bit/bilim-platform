"""Examiner API: `/api/examiner/v1` (api-kelisimderi.md §3.2).

Оқушы тек өз сессиясын көреді: сессия әрдайым `student_id`-мен бірге ізделеді, ал бөтен сессия
`404` қайтарады (api §2.1). Қателер `{"error": {code, message, details}}` пішімінде (api §2.4).
"""

from __future__ import annotations

import asyncio
import logging

import asyncpg
from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ...dependencies.auth import get_current_user_id
from ..bank.repository import create_pool
from .dto import (
    AbandonRequest,
    AnswerRequest,
    AnswerResult,
    ExamSession,
    LevelsResponse,
    ScopeCatalog,
    ScopeType,
    SessionResult,
    StartSessionRequest,
    StudentProfile,
    SubjectCatalogItem,
)
from .errors import ExaminerError
from .service import ExaminerService

PREFIX = "/api/examiner/v1"
logger = logging.getLogger("bilim.examiner.api")

router = APIRouter(prefix=PREFIX, tags=["examiner"])

_service: ExaminerService | None = None
_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()


async def get_service() -> ExaminerService:
    global _service, _pool
    if _service is not None:
        return _service
    async with _lock:
        if _service is None:
            try:
                _pool = await create_pool()
            except Exception as exc:  # noqa: BLE001 — env жоқ немесе база қолжетімсіз
                logger.error("examiner pool unavailable: %s", type(exc).__name__)
                raise ExaminerError(503, "SERVICE_UNAVAILABLE", "Емтихан сервисі уақытша қолжетімсіз.",
                                    retry_after=30) from exc
            _service = ExaminerService(_pool)
    return _service


async def close_service() -> None:
    global _service, _pool
    if _pool is not None:
        await _pool.close()
    _service, _pool = None, None


# ------------------------------------------------------------------ каталог


@router.get("/subjects", response_model=list[SubjectCatalogItem])
async def subjects(
    _: str = Depends(get_current_user_id), service: ExaminerService = Depends(get_service)
) -> list[SubjectCatalogItem]:
    return await service.catalog()


@router.get("/scopes", response_model=ScopeCatalog)
async def scopes(
    book: str = Query(min_length=1, max_length=200),
    _: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> ScopeCatalog:
    return await service.scopes(book)


@router.get("/levels", response_model=LevelsResponse)
async def levels(
    scope_type: ScopeType,
    scope_id: str = Query(min_length=1, max_length=200),
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> LevelsResponse:
    return await service.levels(user_id, scope_type, scope_id)


# ------------------------------------------------------------------ сессия


@router.post("/sessions", response_model=ExamSession)
async def start_session(
    body: StartSessionRequest,
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> ExamSession:
    return await service.start(user_id, body)


@router.get("/sessions/active", response_model=ExamSession | None)
async def active_session(
    user_id: str = Depends(get_current_user_id), service: ExaminerService = Depends(get_service)
) -> ExamSession | None:
    return await service.active(user_id)


@router.get("/sessions/{session_id}", response_model=ExamSession)
async def get_session(
    session_id: str, user_id: str = Depends(get_current_user_id), service: ExaminerService = Depends(get_service)
) -> ExamSession:
    return await service.get(user_id, _uuid(session_id))


@router.post("/sessions/{session_id}/items/{item_id}/answer", response_model=AnswerResult)
async def answer(
    session_id: str,
    item_id: str,
    body: AnswerRequest,
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> AnswerResult:
    return await service.answer(user_id, _uuid(session_id), _uuid(item_id), body)


@router.post("/sessions/{session_id}/abandon", response_model=ExamSession)
async def abandon(
    session_id: str,
    body: AbandonRequest,
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> ExamSession:
    return await service.abandon(user_id, _uuid(session_id), body)


@router.get("/sessions/{session_id}/result", response_model=SessionResult)
async def result(
    session_id: str, user_id: str = Depends(get_current_user_id), service: ExaminerService = Depends(get_service)
) -> SessionResult:
    return await service.result(user_id, _uuid(session_id))


@router.get("/me/profile", response_model=StudentProfile)
async def profile(
    user_id: str = Depends(get_current_user_id), service: ExaminerService = Depends(get_service)
) -> StudentProfile:
    return await service.profile(user_id)


def _uuid(value: str) -> str:
    import uuid

    try:
        return str(uuid.UUID(value))
    except ValueError:
        # Бөтен немесе жарамсыз id-дің бар-жоғы ашылмайды (api §2.1).
        raise ExaminerError(404, "NOT_FOUND", "Табылмады.") from None


# ------------------------------------------------------------------ қателер


def install(app: FastAPI) -> None:
    app.include_router(router)

    @app.exception_handler(ExaminerError)
    async def _examiner_error(_: Request, exc: ExaminerError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        return JSONResponse(exc.body(), status_code=exc.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        if not request.url.path.startswith(PREFIX):
            return await request_validation_exception_handler(request, exc)
        fields = [".".join(str(part) for part in error.get("loc", ())[1:]) for error in exc.errors()]
        error = ExaminerError(400, "VALIDATION_ERROR", "Сұраныстың өрістері қате.", {"fields": fields})
        return JSONResponse(error.body(), status_code=400)

    @app.exception_handler(asyncpg.PostgresError)
    async def _db_error(request: Request, exc: asyncpg.PostgresError) -> JSONResponse:
        logger.error("examiner database error on %s: %s", request.url.path, type(exc).__name__)
        error = ExaminerError(503, "SERVICE_UNAVAILABLE", "Емтихан сервисі уақытша қолжетімсіз.", retry_after=5)
        return JSONResponse(error.body(), status_code=503, headers={"Retry-After": "5"})
