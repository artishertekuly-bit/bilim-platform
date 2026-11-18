"""LLM gateway — Examiner мен Tutor ішіндегі ортақ кітапхана (architect/v2/ortaq-infraqurylym.md §2).

Қолдану:

    from app.llm_gateway import Message, PromptRef, Task, get_gateway

    result = await get_gateway().complete(
        Task.MODERATION,
        PromptRef("moderation", "v1"),
        [Message("system", "..."), Message("user", "...")],
    )
"""

from __future__ import annotations

from .config import GatewayConfig, load_config, parse_config
from .contracts import (
    BatchHandle,
    BatchItemResult,
    BatchRequest,
    BatchStatus,
    LLMResult,
    Message,
    Priority,
    PromptRef,
    Task,
    Usage,
)
from .errors import ConfigError, LLMGatewayError, LLMRequestError, LLMStreamInterrupted, LLMUnavailableError
from .gateway import LLMGateway
from .prompting import wrap_untrusted

_gateway: LLMGateway | None = None


def get_gateway() -> LLMGateway:
    """Процесс ішіндегі бір gateway. Конфигурация бірінші шақыруда жүктеледі."""
    global _gateway
    if _gateway is None:
        _gateway = LLMGateway(load_config())
    return _gateway


__all__ = [
    "BatchHandle",
    "BatchItemResult",
    "BatchRequest",
    "BatchStatus",
    "ConfigError",
    "GatewayConfig",
    "LLMGateway",
    "LLMGatewayError",
    "LLMRequestError",
    "LLMResult",
    "LLMStreamInterrupted",
    "LLMUnavailableError",
    "Message",
    "Priority",
    "PromptRef",
    "Task",
    "Usage",
    "get_gateway",
    "load_config",
    "parse_config",
    "wrap_untrusted",
]
