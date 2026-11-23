"""Ойын API қателері: `{"error": {code, message, details}}` (api-kelisimderi.md §2.4)."""

from __future__ import annotations

from typing import Any


class GamesError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        *,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}
        self.retry_after = retry_after

    def body(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


def not_found() -> GamesError:
    return GamesError(404, "NOT_FOUND", "Табылмады.")


def forbidden(message: str = "Бұл әрекетке рұқсат жоқ.") -> GamesError:
    return GamesError(403, "FORBIDDEN", message)


def unavailable(retry_after: int = 5) -> GamesError:
    return GamesError(503, "SERVICE_UNAVAILABLE", "Ойындар уақытша қолжетімсіз. Сәлден кейін қайталап көріңіз.",
                      retry_after=retry_after)
