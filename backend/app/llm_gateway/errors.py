"""Gateway қателері."""

from __future__ import annotations


class LLMGatewayError(Exception):
    """Gateway қателерінің ортақ класы."""


class ConfigError(LLMGatewayError):
    """Конфигурация қате немесе толық емес."""


class LLMRequestError(LLMGatewayError):
    """Қайталаудан пайда жоқ қате: сұраныс форматы, рұқсат, модель табылмады."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class LLMUnavailableError(LLMGatewayError):
    """Провайдер қайталаулардан кейін де жауап бермеді.

    Ресми бағалау модель ауыстырмайды: шақырушы тапсырманы кезекке қайтарып,
    кейін қайталайды (ortaq §2.4).
    """

    def __init__(self, message: str, *, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class LLMStreamInterrupted(LLMUnavailableError):
    """Ағын бірінші токеннен кейін үзілді: қайталау мен резерв қолданылмайды,
    әйтпесе оқушы бір жауаптың екі нұсқасын көрер еді."""
