"""Ойын API-ының сұраныс модельдері. Жауаптар — сервис құратын сөздіктер (ойынға қарай пішіні әртүрлі)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

GameType = Literal["conquest", "checkers", "battleship", "debate", "baige"]
Mode = Literal["multi", "bot", "solo"]
# D98: сұрақ көзі — оқулық §-тері, дайын пән банкі не еркін тақырып (банк бірінші, тапшылығы генерацияланады).
Source = Literal["paragraphs", "bank", "topic"]


class SourceFields(BaseModel):
    source: Source = "paragraphs"
    subject_id: str | None = Field(default=None, min_length=1, max_length=64)
    book: str | None = Field(default=None, min_length=1, max_length=200)
    topic_ids: list[str] = Field(default_factory=list, max_length=8)
    subject_text: str | None = Field(default=None, max_length=80)
    topic_query: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _source_fields(self) -> "SourceFields":
        if self.source == "paragraphs" and not (self.subject_id and self.book and self.topic_ids):
            raise ValueError("Оқулық режимінде пән, оқулық және кемінде бір § беріледі")
        if self.source == "bank" and not self.subject_id:
            raise ValueError("Пән банкі режимінде пән беріледі")
        if self.source == "topic" and (len((self.subject_text or "").strip()) < 2
                                       or len((self.topic_query or "").strip()) < 2):
            raise ValueError("Еркін тақырып режимінде пән мен тақырып жазылады")
        return self


class CreateRoomRequest(SourceFields):
    model_config = ConfigDict(extra="forbid")

    game_type: GameType
    mode: Mode = "multi"
    settings: dict[str, int] = Field(default_factory=dict)


class PreviewRequest(SourceFields):
    """Бөлме ашпай, таңдалған көзде қанша сұрақ барын және генерация керек пе екенін көрсету (D98)."""

    model_config = ConfigDict(extra="forbid")

    game_type: GameType


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
