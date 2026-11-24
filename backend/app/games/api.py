"""Ойын API: `/api/games/v1` (geimifikatsiya §5–§7, api-kelisimderi.md §2, §11).

Бөлмені оқушы да, мұғалім де ашады; ойнайтын — тек оқушы. Бөлмеге бөлме иесімен бір сыныптағы оқушы ғана
кіреді (D52). Бөтен бөлме — 404. Ойын күйі әрекеттің жауабында және Realtime арналарында (D67) келеді.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

import asyncpg
from fastapi import APIRouter, Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse

from ..dependencies.auth import get_current_user_with_role
from .db import create_pool
from .dto import ActionRequest, CreateRoomRequest, JoinRoomRequest, PreviewRequest
from .errors import GamesError, forbidden, unavailable
from .service import GamesService

PREFIX = "/api/games/v1"
logger = logging.getLogger("bilim.games.api")

router = APIRouter(prefix=PREFIX, tags=["games"])

_service: GamesService | None = None
_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()
_T = TypeVar("_T")


async def get_service() -> GamesService:
    global _service, _pool
    if _service is not None:
        return _service
    async with _lock:
        if _service is None:
            try:
                _pool = await create_pool()
            except Exception as exc:  # noqa: BLE001 — env жоқ немесе база қолжетімсіз
                logger.error("games pool unavailable: %s", type(exc).__name__)
                raise unavailable(30) from exc
            _service = GamesService(_pool)
    return _service


async def start_background() -> None:
    """Қосымша іске қосылғанда: пул ашылады да, таймер циклі басталады (D54). Қате іске қосылуды бөгемейді."""
    try:
        service = await get_service()
        service.start_sweeper()
        logger.info("games sweeper started")
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 — бірінші сұраныс пулды қайта ашады
        logger.warning("games background start failed: %s", type(exc).__name__)


async def close_service() -> None:
    global _service, _pool
    if _service is not None:
        await _service.close()
    if _pool is not None:
        await _pool.close()
    _service, _pool = None, None


def current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> tuple[str, str]:
    user_id, role = get_current_user_with_role(authorization=authorization, x_user_id=x_user_id)
    if role not in ("student", "teacher"):
        raise forbidden("Ойындар оқушы мен мұғалімге қолжетімді.")
    return user_id, role


async def _db(operation: Callable[[], Awaitable[_T]]) -> _T:
    try:
        return await operation()
    except asyncpg.PostgresError as exc:
        logger.error("games database error: %s", type(exc).__name__)
        raise unavailable() from exc


@router.get("/scopes")
async def scopes(_: tuple[str, str] = Depends(current_user), service: GamesService = Depends(get_service)):
    return await _db(service.scopes)


@router.get("/bank-subjects")
async def bank_subjects(_: tuple[str, str] = Depends(current_user), service: GamesService = Depends(get_service)):
    """D98: «Дайын пән банкі» — емтихан банкінде белсенді тесті бар пәндер (тек оқу көпірі)."""
    return await _db(service.bank_subjects)


@router.post("/sources/preview")
async def preview_source(body: PreviewRequest, _: tuple[str, str] = Depends(current_user),
                         service: GamesService = Depends(get_service)):
    """D98: таңдалған көздегі сұрақ саны және генерация керек пе — бөлме ашпай, LLM шақырмай."""
    return await _db(lambda: service.preview(body))


@router.post("/rooms", status_code=201)
async def create_room(body: CreateRoomRequest, user: tuple[str, str] = Depends(current_user),
                      service: GamesService = Depends(get_service)):
    return await _db(lambda: service.create_room(user[0], user[1], body))


@router.post("/rooms/join")
async def join_room(body: JoinRoomRequest, user: tuple[str, str] = Depends(current_user),
                    service: GamesService = Depends(get_service)):
    return await _db(lambda: service.join(user[0], user[1], body.code))


@router.get("/rooms/mine")
async def my_rooms(user: tuple[str, str] = Depends(current_user), service: GamesService = Depends(get_service)):
    return await _db(lambda: service.my_rooms(user[0]))


@router.get("/rooms/{room_id}")
async def room(room_id: str, user: tuple[str, str] = Depends(current_user),
               service: GamesService = Depends(get_service)):
    return await _db(lambda: service.room(user[0], room_id))


@router.post("/rooms/{room_id}/start")
async def start_room(room_id: str, user: tuple[str, str] = Depends(current_user),
                     service: GamesService = Depends(get_service)):
    return await _db(lambda: service.start(user[0], room_id))


@router.post("/rooms/{room_id}/leave")
async def leave_room(room_id: str, user: tuple[str, str] = Depends(current_user),
                     service: GamesService = Depends(get_service)):
    return await _db(lambda: service.leave(user[0], room_id))


@router.post("/rooms/{room_id}/actions")
async def act(room_id: str, body: ActionRequest, user: tuple[str, str] = Depends(current_user),
              service: GamesService = Depends(get_service)):
    if user[1] != "student":
        raise forbidden("Ойын әрекетін тек ойыншы жасайды.")
    return await _db(lambda: service.act(user[0], room_id, body))


@router.get("/practice/record")
async def practice_record(user: tuple[str, str] = Depends(current_user),
                          service: GamesService = Depends(get_service)):
    return await _db(lambda: service.record(user[0]))


def install(app: FastAPI) -> None:
    app.include_router(router)

    @app.exception_handler(GamesError)
    async def _games_error(_: Request, exc: GamesError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        return JSONResponse(exc.body(), status_code=exc.status, headers=headers)
