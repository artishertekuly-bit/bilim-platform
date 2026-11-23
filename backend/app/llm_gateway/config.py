"""Gateway конфигурациясы: тапсырма → модель картасы, провайдерлер, лимиттер, баға.

Модель атаулары кодта емес, `backend/config/llm_gateway.json` ішінде тұрады (ortaq §2.1).
Мәндерде `${ENV}` немесе `${ENV:-әдепкі}` түріндегі env айнымалылары қолданылады.
Атауы берілмеген модель жүктеу кезінде қате бермейді: ол тек сол модельді
қолданатын тапсырма шақырылғанда ConfigError береді.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from .contracts import EXPECTED_MODE, FALLBACK_ALLOWED, Task, Usage
from .errors import ConfigError
from .retry import RetryPolicy

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "llm_gateway.json"

_ENV_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
_PROVIDER_TYPES = frozenset({"openai_compat"})
_MODES = frozenset({"sync", "stream", "batch"})
_KINDS = frozenset({"chat", "embedding"})


def resolve_env(value: str | None, env: Mapping[str, str]) -> str | None:
    """`${NAME}` / `${NAME:-default}` орнына мән қояды. Мәні жоқ айнымалы болса — None."""
    if value is None:
        return None
    missing = False

    def replace(match: re.Match[str]) -> str:
        nonlocal missing
        name, default = match.group(1), match.group(2)
        found = (env.get(name) or "").strip()
        if found:
            return found
        if default is not None:
            return default
        missing = True
        return ""

    resolved = _ENV_PATTERN.sub(replace, str(value)).strip()
    return None if missing or not resolved else resolved


@dataclass(frozen=True)
class Pricing:
    """USD, 1 млн токенге. `batch_discount` — Batch API бағасының үлесі (мысалы, 0.5)."""

    input_per_mtok: float
    output_per_mtok: float
    cached_input_per_mtok: float | None = None
    batch_discount: float = 1.0

    def cost(self, usage: Usage, *, batch: bool = False) -> float:
        cached_rate = self.cached_input_per_mtok if self.cached_input_per_mtok is not None else self.input_per_mtok
        uncached = max(0, usage.input_tokens - usage.cached_tokens)
        total = (
            uncached * self.input_per_mtok
            + usage.cached_tokens * cached_rate
            + usage.output_tokens * self.output_per_mtok
        ) / 1_000_000
        return total * (self.batch_discount if batch else 1.0)


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    type: str
    api_key: str | None
    base_url: str | None
    structured_outputs: str = "json_schema"  # json_schema | json_object
    max_tokens_param: str = "max_completion_tokens"  # кей провайдерлерде max_tokens

    @property
    def configured(self) -> bool:
        return bool(self.api_key or self.base_url)


@dataclass(frozen=True)
class ModelConfig:
    key: str
    provider: str
    model: str | None  # None — env айнымалысы берілмеген
    model_spec: str
    kind: str = "chat"
    pinned: bool = False  # бекітілген нұсқа (dated snapshot)
    rpm: int | None = None
    tpm: int | None = None
    max_concurrency: int = 8
    pricing: Pricing | None = None


@dataclass(frozen=True)
class RouteVariant:
    """Маршруттың бір бөлігіне (мысалы, генерацияда бір форматқа) басқа модель не баптау (D75).
    Берілмеген өріс маршруттың өзінен алынады."""

    model: str | None = None
    reasoning_effort: str | None = None
    max_output_tokens: int | None = None
    timeout_s: float | None = None


@dataclass(frozen=True)
class RouteConfig:
    task: Task
    model: str
    mode: str
    temperature: float | None
    max_output_tokens: int | None
    timeout_s: float
    fallback: tuple[str, ...] = ()
    retry: RetryPolicy = RetryPolicy()
    format_retries: int = 2
    strict_schema: bool = False
    reasoning_effort: str | None = None  # ойлау модельдері үшін; басқа модельдерде ескерілмейді
    variants: Mapping[str, RouteVariant] = field(default_factory=dict)
    # true болса, провайдерге `prompt_cache_key` = prompt id + нұсқа (+ variant) жіберіледі: тұрақты префикс
    # бір кэшке түсуі үшін (ortaq §2.2).
    prompt_cache: bool = False
    variant: str | None = None  # resolve() таңдаған нұсқаның атауы

    def resolve(self, variant: str | None) -> RouteConfig:
        """Нұсқасы бар болса, оның мәндері қойылған маршрут; жоқ болса — маршрут өзгеріссіз."""
        override = self.variants.get(variant) if variant else None
        if override is None:
            return self
        return replace(
            self,
            model=override.model or self.model,
            reasoning_effort=override.reasoning_effort or self.reasoning_effort,
            max_output_tokens=override.max_output_tokens or self.max_output_tokens,
            timeout_s=override.timeout_s or self.timeout_s,
            variants={},
            variant=variant,
        )

    def cache_key(self, prompt_id: str, prompt_version: str) -> str | None:
        if not self.prompt_cache:
            return None
        return ":".join(part for part in (prompt_id, prompt_version, self.variant) if part)

    @property
    def model_keys(self) -> frozenset[str]:
        """Маршруттың негізгі модельдері (нұсқалармен бірге): резервті ажырату үшін."""
        return frozenset({self.model, *(v.model for v in self.variants.values() if v.model)})


REASONING_EFFORTS = frozenset({"none", "minimal", "low", "medium", "high"})


@dataclass(frozen=True)
class GatewayConfig:
    providers: Mapping[str, ProviderConfig]
    models: Mapping[str, ModelConfig]
    routes: Mapping[Task, RouteConfig]
    embeddings: Mapping[str, str]
    chars_per_token: float = 2.5
    embedding_timeout_s: float = 30.0

    def route(self, task: Task, variant: str | None = None) -> RouteConfig:
        return self.routes[task].resolve(variant)


def _require(data: Mapping[str, Any], key: str, where: str) -> Any:
    if key not in data:
        raise ConfigError(f"{where}: '{key}' өрісі жоқ")
    return data[key]


def _unknown_keys(data: Mapping[str, Any], allowed: set[str], where: str) -> None:
    extra = sorted(set(data) - allowed)
    if extra:
        raise ConfigError(f"{where}: белгісіз өрістер {extra}")


def _positive_or_none(value: Any, where: str) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or value <= 0:
        raise ConfigError(f"{where}: оң бүтін сан немесе null болуы керек")
    return value


def _parse_providers(raw: Mapping[str, Any], env: Mapping[str, str]) -> dict[str, ProviderConfig]:
    providers: dict[str, ProviderConfig] = {}
    for name, item in raw.items():
        where = f"providers.{name}"
        _unknown_keys(
            item,
            {"type", "api_key_env", "base_url_env", "base_url", "structured_outputs", "max_tokens_param"},
            where,
        )
        kind = _require(item, "type", where)
        if kind not in _PROVIDER_TYPES:
            raise ConfigError(f"{where}: белгісіз провайдер түрі '{kind}'")
        structured = item.get("structured_outputs", "json_schema")
        if structured not in ("json_schema", "json_object"):
            raise ConfigError(f"{where}: structured_outputs json_schema немесе json_object болуы керек")
        max_tokens_param = item.get("max_tokens_param", "max_completion_tokens")
        if max_tokens_param not in ("max_completion_tokens", "max_tokens"):
            raise ConfigError(f"{where}: max_tokens_param max_completion_tokens немесе max_tokens болуы керек")
        api_key_env = item.get("api_key_env")
        base_url_env = item.get("base_url_env")
        base_url = (env.get(base_url_env) or "").strip() if base_url_env else ""
        providers[name] = ProviderConfig(
            name=name,
            type=kind,
            api_key=((env.get(api_key_env) or "").strip() or None) if api_key_env else None,
            base_url=base_url or item.get("base_url") or None,
            structured_outputs=structured,
            max_tokens_param=max_tokens_param,
        )
    return providers


def _parse_pricing(raw: Mapping[str, Any] | None, where: str) -> Pricing | None:
    if raw is None:
        return None
    _unknown_keys(raw, {"input_per_mtok", "output_per_mtok", "cached_input_per_mtok", "batch_discount"}, where)
    try:
        return Pricing(
            input_per_mtok=float(_require(raw, "input_per_mtok", where)),
            output_per_mtok=float(_require(raw, "output_per_mtok", where)),
            cached_input_per_mtok=(
                float(raw["cached_input_per_mtok"]) if raw.get("cached_input_per_mtok") is not None else None
            ),
            batch_discount=float(raw.get("batch_discount", 1.0)),
        )
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{where}: баға сан болуы керек") from exc


def _parse_models(
    raw: Mapping[str, Any], providers: Mapping[str, ProviderConfig], env: Mapping[str, str]
) -> dict[str, ModelConfig]:
    models: dict[str, ModelConfig] = {}
    for key, item in raw.items():
        where = f"models.{key}"
        _unknown_keys(
            item, {"provider", "model", "kind", "pinned", "rpm", "tpm", "max_concurrency", "pricing"}, where
        )
        provider = _require(item, "provider", where)
        if provider not in providers:
            raise ConfigError(f"{where}: '{provider}' провайдері жоқ")
        kind = item.get("kind", "chat")
        if kind not in _KINDS:
            raise ConfigError(f"{where}: kind chat немесе embedding болуы керек")
        max_concurrency = item.get("max_concurrency", 8)
        if not isinstance(max_concurrency, int) or max_concurrency < 1:
            raise ConfigError(f"{where}: max_concurrency кемінде 1 болуы керек")
        spec = str(_require(item, "model", where))
        models[key] = ModelConfig(
            key=key,
            provider=provider,
            model=resolve_env(spec, env),
            model_spec=spec,
            kind=kind,
            pinned=bool(item.get("pinned", False)),
            rpm=_positive_or_none(item.get("rpm"), f"{where}.rpm"),
            tpm=_positive_or_none(item.get("tpm"), f"{where}.tpm"),
            max_concurrency=max_concurrency,
            pricing=_parse_pricing(item.get("pricing"), f"{where}.pricing"),
        )
    return models


def _parse_retry(raw: Mapping[str, Any] | None, where: str) -> RetryPolicy:
    if raw is None:
        return RetryPolicy()
    _unknown_keys(raw, {"max_attempts", "base_delay_s", "max_delay_s", "max_retry_after_s"}, where)
    try:
        return RetryPolicy(**raw)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{where}: {exc}") from exc


def _parse_route(task: Task, item: Mapping[str, Any], models: Mapping[str, ModelConfig]) -> RouteConfig:
    where = f"routes.{task.value}"
    _unknown_keys(
        item,
        {
            "model",
            "mode",
            "temperature",
            "max_output_tokens",
            "timeout_s",
            "fallback",
            "retry",
            "format_retries",
            "strict_schema",
            "reasoning_effort",
            "variants",
            "prompt_cache",
        },
        where,
    )
    reasoning_effort = item.get("reasoning_effort")
    if reasoning_effort is not None and reasoning_effort not in REASONING_EFFORTS:
        raise ConfigError(f"{where}: reasoning_effort {sorted(REASONING_EFFORTS)} мәндерінің бірі болуы керек")
    model_key = _require(item, "model", where)
    model = models.get(model_key)
    if model is None or model.kind != "chat":
        raise ConfigError(f"{where}: '{model_key}' chat моделі жоқ")

    mode = item.get("mode", "sync")
    if mode not in _MODES:
        raise ConfigError(f"{where}: mode sync, stream немесе batch болуы керек")
    expected = EXPECTED_MODE.get(task, "sync")
    if mode != expected:
        raise ConfigError(f"{where}: бұл тапсырманың режимі '{expected}' (ortaq §2.1)")

    temperature = item.get("temperature")
    if temperature is not None and not (0 <= float(temperature) <= 2):
        raise ConfigError(f"{where}: temperature 0 мен 2 аралығында болуы керек")

    fallback = tuple(item.get("fallback") or ())
    if fallback and task not in FALLBACK_ALLOWED:
        raise ConfigError(f"{where}: резерв провайдер тек Tutor мен генерацияға рұқсат етілген (ortaq §2.4)")
    for fallback_key in fallback:
        fallback_model = models.get(fallback_key)
        if fallback_model is None or fallback_model.kind != "chat":
            raise ConfigError(f"{where}: резерв '{fallback_key}' chat моделі жоқ")
        if fallback_model.provider == model.provider:
            raise ConfigError(f"{where}: резерв модель басқа провайдерде болуы керек")

    if task is Task.OFFICIAL_GRADING:
        # Ресми бағалау: бекітілген нұсқа, temperature 0 (ortaq §2.1, bagalau Т5).
        if not model.pinned:
            raise ConfigError(f"{where}: ресми бағалау моделі pinned (dated snapshot) болуы керек")
        if temperature is None or float(temperature) != 0:
            raise ConfigError(f"{where}: ресми бағалауда temperature 0 болуы керек")

    format_retries = item.get("format_retries", 2)
    if not isinstance(format_retries, int) or format_retries < 0:
        raise ConfigError(f"{where}: format_retries теріс емес бүтін сан болуы керек")

    timeout_s = float(item.get("timeout_s", 30))
    if timeout_s <= 0:
        raise ConfigError(f"{where}: timeout_s оң сан болуы керек")

    max_output_tokens = _positive_or_none(item.get("max_output_tokens"), f"{where}.max_output_tokens")

    raw_variants = item.get("variants") or {}
    if raw_variants and task is Task.OFFICIAL_GRADING:
        raise ConfigError(f"{where}: ресми бағалау маршрутында нұсқа болмайды (бекітілген модель)")
    variants = {
        name: _parse_variant(raw, models, fallback, f"{where}.variants.{name}") for name, raw in raw_variants.items()
    }

    return RouteConfig(
        task=task,
        model=model_key,
        mode=mode,
        temperature=float(temperature) if temperature is not None else None,
        max_output_tokens=max_output_tokens,
        timeout_s=timeout_s,
        fallback=fallback,
        retry=_parse_retry(item.get("retry"), f"{where}.retry"),
        format_retries=format_retries,
        strict_schema=bool(item.get("strict_schema", False)),
        reasoning_effort=reasoning_effort,
        variants=variants,
        prompt_cache=bool(item.get("prompt_cache", False)),
    )


def _parse_variant(
    raw: Mapping[str, Any], models: Mapping[str, ModelConfig], fallback: tuple[str, ...], where: str
) -> RouteVariant:
    _unknown_keys(raw, {"model", "reasoning_effort", "max_output_tokens", "timeout_s"}, where)
    model_key = raw.get("model")
    if model_key is not None:
        model = models.get(model_key)
        if model is None or model.kind != "chat":
            raise ConfigError(f"{where}: '{model_key}' chat моделі жоқ")
        if any(models[key].provider == model.provider for key in fallback):
            raise ConfigError(f"{where}: резерв модель нұсқа моделінен басқа провайдерде болуы керек")
    effort = raw.get("reasoning_effort")
    if effort is not None and effort not in REASONING_EFFORTS:
        raise ConfigError(f"{where}: reasoning_effort {sorted(REASONING_EFFORTS)} мәндерінің бірі болуы керек")
    timeout_s = raw.get("timeout_s")
    if timeout_s is not None and float(timeout_s) <= 0:
        raise ConfigError(f"{where}: timeout_s оң сан болуы керек")
    return RouteVariant(
        model=model_key,
        reasoning_effort=effort,
        max_output_tokens=_positive_or_none(raw.get("max_output_tokens"), f"{where}.max_output_tokens"),
        timeout_s=float(timeout_s) if timeout_s is not None else None,
    )


def parse_config(data: Mapping[str, Any], env: Mapping[str, str] | None = None) -> GatewayConfig:
    env = os.environ if env is None else env
    _unknown_keys(
        data, {"providers", "models", "routes", "embeddings", "chars_per_token", "embedding_timeout_s"}, "config"
    )
    providers = _parse_providers(_require(data, "providers", "config"), env)
    models = _parse_models(_require(data, "models", "config"), providers, env)

    raw_routes = _require(data, "routes", "config")
    unknown_tasks = sorted(set(raw_routes) - {task.value for task in Task})
    if unknown_tasks:
        raise ConfigError(f"routes: белгісіз тапсырмалар {unknown_tasks}")
    missing_tasks = sorted(task.value for task in Task if task.value not in raw_routes)
    if missing_tasks:
        raise ConfigError(f"routes: бұл тапсырмаларға маршрут жоқ {missing_tasks}")
    routes = {task: _parse_route(task, raw_routes[task.value], models) for task in Task}

    embeddings: dict[str, str] = {}
    for name, model_key in (data.get("embeddings") or {}).items():
        model = models.get(model_key)
        if model is None or model.kind != "embedding":
            raise ConfigError(f"embeddings.{name}: '{model_key}' embedding моделі жоқ")
        embeddings[name] = model_key

    chars_per_token = float(data.get("chars_per_token", 2.5))
    if chars_per_token <= 0:
        raise ConfigError("chars_per_token оң сан болуы керек")

    return GatewayConfig(
        providers=providers,
        models=models,
        routes=routes,
        embeddings=embeddings,
        chars_per_token=chars_per_token,
        embedding_timeout_s=float(data.get("embedding_timeout_s", 30.0)),
    )


def load_config(path: str | Path | None = None, env: Mapping[str, str] | None = None) -> GatewayConfig:
    env = os.environ if env is None else env
    config_path = Path(path or env.get("LLM_GATEWAY_CONFIG") or DEFAULT_CONFIG_PATH)
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"Конфигурация файлы табылмады: {config_path}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Конфигурация JSON қате: {config_path}: {exc}") from exc
    return parse_config(data, env)
