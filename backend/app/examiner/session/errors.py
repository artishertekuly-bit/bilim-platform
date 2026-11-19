"""Examiner API қатесі (api-kelisimderi.md §2.4): `{"error": {code, message, details}}`."""

from __future__ import annotations

from typing import Any


class ExaminerError(Exception):
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


def not_found(message: str = "Табылмады.") -> ExaminerError:
    return ExaminerError(404, "NOT_FOUND", message)


def validation(message: str, details: dict[str, Any] | None = None) -> ExaminerError:
    return ExaminerError(400, "VALIDATION_ERROR", message, details)
