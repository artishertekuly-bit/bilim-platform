"""Ойын API-ының сұраныс модельдері. Жауаптар — сервис құратын сөздіктер (ойынға қарай пішіні әртүрлі)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GameType = Literal["conquest", "checkers", "battleship", "debate", "baige"]
Mode = Literal["multi", "bot", "solo"]


class CreateRoomRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_type: GameType
    mode: Mode = "multi"
    subject_id: str = Field(min_length=1, max_length=64)
    book: str = Field(min_length=1, max_length=200)
    topic_ids: list[str] = Field(min_length=1, max_length=8)
    settings: dict[str, int] = Field(default_factory=dict)


class JoinRoomRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=6, max_length=6)


class ActionRequest(BaseModel):
    """Ойын әрекеті. Тек ойынға керек өрістер беріледі; `moderation` сияқты серверлік өрістер қабылданбайды."""

    model_config = ConfigDict(extra="forbid")

    client_request_id: uuid.UUID
    type: Literal["pick", "card", "answer", "move", "place", "auto_place", "shoot", "submit", "decide"]
    option: str | None = Field(default=None, max_length=8)
    cell: int | None = Field(default=None, ge=0, le=63)
    card: Literal["fifty", "double", "second", "shield"] | None = None
    path: list[int] | None = Field(default=None, max_length=20)
    ships: list[list[int]] | None = Field(default=None, max_length=5)
    choice: Literal["stop", "continue"] | None = None
    text: str | None = Field(default=None, max_length=2000)

    def payload(self) -> dict:
        data = self.model_dump(exclude_none=True)
        data.pop("client_request_id", None)
        return data
