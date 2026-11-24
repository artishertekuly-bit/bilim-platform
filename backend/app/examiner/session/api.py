"""Examiner API: `/api/examiner/v1` (api-kelisimderi.md §3.2, §3.9).

Оқушы тек өз сессиясын көреді (`404` бөтен сессияда).
Мұғалім эндпоинттары тек `teacher` рөліне ашық (`admin` мен `student` 403 алады, api §2.1).
Қателер `{"error": {code, message, details}}` пішімінде (api §2.4).
"""

from __future__ import annotations

import asyncio
import logging
import uuid

import asyncpg
from fastapi import APIRouter, Depends, FastAPI, Header, Query, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse

from ...dependencies.auth import get_current_user_id, get_current_user_with_role
from ..bank.repository import create_pool
from .dto import (
    AbandonRequest,
    AnswerRequest,
    AnswerResult,
    AppealRequest,
    AppealResponse,
    ClassProfilesResponse,
    ClassRatingResponse,
    ConfirmGradeRequest,
    DialogTurnRequest,
    ExamSession,
    ExplanationResponse,
    FalsePositiveRequest,
    FalsePositiveResponse,
    LevelsResponse,
    OverrideGradeRequest,
    ReviewQueueResponse,
    ScopeCatalog,
    ScopeType,
    SessionResult,
    StartSessionRequest,
    StudentProfile,
    SubjectCatalogItem,
    TeacherGradeActionResponse,
    TeacherGradeDetail,
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
    if _service is not None:
        await _service.close()
    if _pool is not None:
        await _pool.close()
    _service, _pool = None, None


def require_teacher_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    """api §2.1: мұғалім кезегі тек мұғалімге (admin де оқушы нәтижесін оқымайды)."""
    user_id, role = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
    if role != "teacher":
        raise ExaminerError(403, "FORBIDDEN", "Бұл әрекет тек мұғалімге қолжетімді.")
    return user_id


def require_parent_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    """api §3.10: баланың профилі тек ата-анаға (байланысы сервисте тексеріледі)."""
    user_id, role = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
    if role != "parent":
        raise ExaminerError(403, "FORBIDDEN", "Бұл әрекет тек ата-анаға қолжетімді.")
    return user_id


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


@router.get("/subject-levels", response_model=LevelsResponse)
async def subject_levels(
    subject_id: str = Query(min_length=1, max_length=64),
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> LevelsResponse:
    """D93: the four level cards of a subject with the learner's latest result per level (any topic)."""
    try:
        sid = str(uuid.UUID(subject_id))
    except ValueError:
        raise ExaminerError(404, "NOT_FOUND", "Пән табылмады.") from None
    return await service.subject_levels(user_id, sid)


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


@router.get("/sessions/{session_id}/items/{item_id}/explanation", response_model=ExplanationResponse)
async def explanation(
    session_id: str,
    item_id: str,
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> JSONResponse:
    status_code, data = await service.explanation(user_id, _uuid(session_id), _uuid(item_id))
    headers = {"Retry-After": "1"} if status_code == 202 else None
    return JSONResponse(data.model_dump(mode="json"), status_code=status_code, headers=headers)


@router.post("/sessions/{session_id}/items/{item_id}/turns")
async def dialog_turn(
    session_id: str,
    item_id: str,
    body: DialogTurnRequest,
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> StreamingResponse:
    stream = await service.stream_turn(user_id, _uuid(session_id), _uuid(item_id), body)
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/items/{item_id}/appeal", response_model=AppealResponse)
async def appeal_item(
    session_id: str,
    item_id: str,
    body: AppealRequest,
    user_id: str = Depends(get_current_user_id),
    service: ExaminerService = Depends(get_service),
) -> AppealResponse:
    return await service.appeal(user_id, _uuid(session_id), _uuid(item_id), body)


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


# ------------------------------------------------------------------ ата-ана (api §3.10)


@router.get("/parent/children/{student_id}/profile", response_model=StudentProfile)
async def child_profile(
    student_id: str,
    parent_id: str = Depends(require_parent_id),
    service: ExaminerService = Depends(get_service),
) -> StudentProfile:
    return await service.parent_child_profile(parent_id, _uuid(student_id))


# ------------------------------------------------------------------ мұғалім (api §3.9)


@router.get("/teacher/classes/{class_id}/profiles", response_model=ClassProfilesResponse)
async def class_profiles_route(
    class_id: str,
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> ClassProfilesResponse:
    return await service.teacher_class_profiles(teacher_id, _uuid(class_id))


@router.get("/teacher/classes/{class_id}/rating", response_model=ClassRatingResponse)
async def class_rating_route(
    class_id: str,
    book: str | None = Query(default=None, min_length=1, max_length=200),
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> ClassRatingResponse:
    return await service.teacher_class_rating(teacher_id, _uuid(class_id), book)


@router.get("/teacher/review-queue", response_model=ReviewQueueResponse)
async def review_queue(
    class_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> ReviewQueueResponse:
    cid = _uuid(class_id) if class_id is not None else None
    return await service.teacher_review_queue(teacher_id, class_id=cid, limit=limit, offset=offset)


@router.get("/teacher/grades/{grade_id}", response_model=TeacherGradeDetail)
async def grade_detail(
    grade_id: str,
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> TeacherGradeDetail:
    return await service.teacher_grade_detail(teacher_id, _uuid(grade_id))


@router.post("/teacher/grades/{grade_id}/confirm", response_model=TeacherGradeActionResponse)
async def confirm_grade_route(
    grade_id: str,
    body: ConfirmGradeRequest,
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> TeacherGradeActionResponse:
    return await service.teacher_confirm_grade(teacher_id, _uuid(grade_id), body)


@router.post("/teacher/grades/{grade_id}/override", response_model=TeacherGradeActionResponse)
async def override_grade_route(
    grade_id: str,
    body: OverrideGradeRequest,
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> TeacherGradeActionResponse:
    return await service.teacher_override_grade(teacher_id, _uuid(grade_id), body)


@router.post("/teacher/alerts/{alert_id}/false-positive", response_model=FalsePositiveResponse)
async def false_positive_route(
    alert_id: str,
    body: FalsePositiveRequest,
    teacher_id: str = Depends(require_teacher_id),
    service: ExaminerService = Depends(get_service),
) -> FalsePositiveResponse:
    return await service.teacher_false_positive(teacher_id, _uuid(alert_id), body)


def _uuid(value: str) -> str:
    import uuid

    try:
        return str(uuid.UUID(value))
    except ValueError:
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
