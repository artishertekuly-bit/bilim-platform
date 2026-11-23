"""Tutor API: `/api/tutor/v1` (api-kelisimderi.md §4).

Оқушы тек өз диалогын көреді (бөтен диалог — 404). Мұғалім командалары тек `teacher` рөліне және тек
өз сыныбындағы оқушыға (байланысы жоқ оқушы — 404, api §2.1). Әкімші оқушы деректеріне кірмейді.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TypeVar

import asyncpg
from fastapi import APIRouter, Depends, FastAPI, Header, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ..dependencies.auth import get_current_user_with_role
from .db import create_pool
from .dto import BlockState, Conversation, MessagesPage, SendMessageRequest, TeacherBlockRequest, TutorSubject
from .errors import TutorError, not_found, unavailable
from .service import TutorService

PREFIX = "/api/tutor/v1"
logger = logging.getLogger("bilim.tutor.api")

router = APIRouter(prefix=PREFIX, tags=["tutor"])

_service: TutorService | None = None
_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()
_T = TypeVar("_T")


async def get_service() -> TutorService:
    global _service, _pool
    if _service is not None:
        return _service
    async with _lock:
        if _service is None:
            try:
                _pool = await create_pool()
            except Exception as exc:  # noqa: BLE001 — env жоқ немесе база қолжетімсіз
                logger.error("tutor pool unavailable: %s", type(exc).__name__)
                raise unavailable(30) from exc
            _service = TutorService(_pool)
    return _service


async def close_service() -> None:
    global _service, _pool
    if _service is not None:
        await _service.close()
    if _pool is not None:
        await _pool.close()
    _service, _pool = None, None


def require_student_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    """Тьютор — оқушының ортасы (personarag §1): диалогты тек оқушы ашады."""
    user_id, role = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
    if role != "student":
        raise TutorError(403, "FORBIDDEN", "Тьютор тек оқушыға қолжетімді.")
    return user_id


def require_teacher_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    user_id, role = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
    if role != "teacher":
        raise TutorError(403, "FORBIDDEN", "Бұл әрекет тек мұғалімге қолжетімді.")
    return user_id


def _uuid(value: str | None) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        raise not_found() from None


async def _db(operation: Callable[[], Awaitable[_T]]) -> _T:
    try:
        return await operation()
    except asyncpg.PostgresError as exc:
        logger.error("tutor database error: %s", type(exc).__name__)
        raise unavailable() from exc


# ------------------------------------------------------------------ оқушы


@router.get("/subjects", response_model=list[TutorSubject])
async def subjects(_: str = Depends(require_student_id), service: TutorService = Depends(get_service)):
    return await _db(service.subjects)


@router.get("/conversations/current", response_model=Conversation)
async def current_conversation(
    subject_id: str = Query(min_length=1, max_length=64),
    student_id: str = Depends(require_student_id),
    service: TutorService = Depends(get_service),
):
    sid = _uuid(subject_id)
    return await _db(lambda: service.current_conversation(student_id, sid))


@router.get("/conversations/{conversation_id}/messages", response_model=MessagesPage)
async def conversation_messages(
    conversation_id: str,
    before: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=50),
    student_id: str = Depends(require_student_id),
    service: TutorService = Depends(get_service),
):
    cid = _uuid(conversation_id)
    anchor = _uuid(before) if before else None
    return await _db(lambda: service.messages(student_id, cid, anchor, limit))


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    student_id: str = Depends(require_student_id),
    service: TutorService = Depends(get_service),
) -> StreamingResponse:
    cid = _uuid(conversation_id)
    stream: AsyncIterator[str] = await _db(lambda: service.send(student_id, cid, body))
    return StreamingResponse(
        stream, media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ------------------------------------------------------------------ мұғалім (personarag §6.3, D70)


@router.get("/teacher/students/{student_id}/block", response_model=BlockState)
async def block_state(
    student_id: str, teacher_id: str = Depends(require_teacher_id), service: TutorService = Depends(get_service)
):
    sid = _uuid(student_id)
    return await _db(lambda: service.teacher_block_state(teacher_id, sid))


@router.post("/teacher/students/{student_id}/unblock", response_model=BlockState)
async def unblock(
    student_id: str,
    _: TeacherBlockRequest,
    teacher_id: str = Depends(require_teacher_id),
    service: TutorService = Depends(get_service),
):
    sid = _uuid(student_id)
    return await _db(lambda: service.teacher_set_block(teacher_id, sid, lock=False))


@router.post("/teacher/students/{student_id}/lock", response_model=BlockState)
async def lock(
    student_id: str,
    _: TeacherBlockRequest,
    teacher_id: str = Depends(require_teacher_id),
    service: TutorService = Depends(get_service),
):
    sid = _uuid(student_id)
    return await _db(lambda: service.teacher_set_block(teacher_id, sid, lock=True))


def install(app: FastAPI) -> None:
    app.include_router(router)

    @app.exception_handler(TutorError)
    async def _tutor_error(_: Request, exc: TutorError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        return JSONResponse(exc.body(), status_code=exc.status, headers=headers)
