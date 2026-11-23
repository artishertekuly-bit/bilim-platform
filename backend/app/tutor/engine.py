"""Tutor-дың математикасы мен күй машинасы (personarag §3–§6, D8, D18).

Мұнда LLM де, база да жоқ: тегтерді LLM береді, ал барлық есеп пен маршрут осы таза функцияларда
жүреді (personarag §1, «Python vs LLM»). Сондықтан әр ереже unit тестпен тексеріледі.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

# ------------------------------------------------------------------ тұрақтылар (personarag §3)

BLOOM_ORDER: tuple[str, ...] = ("REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE")

LAMBDA_BLOOM: dict[str, float] = {
    "REMEMBER": 0.04, "UNDERSTAND": 0.04,
    "APPLY": 0.02, "ANALYZE": 0.02,
    "EVALUATE": 0.01, "CREATE": 0.01,
}
B_BLOOM: dict[str, float] = {
    "REMEMBER": 0.15, "UNDERSTAND": 0.20, "APPLY": 0.25, "ANALYZE": 0.30, "EVALUATE": 0.35, "CREATE": 0.35,
}
DELTA_ERR: dict[str, float] = {"GAP": 0.15, "MISC": 0.25}
GAMMA_ARG: dict[str, float] = {"NONE": 0.0, "ECHO": 0.3, "FULL": 1.0}

W_FOCAL = 1.0
W_BRIDGE = 0.2
C_PASSIVE = 0.25          # PASSIVE_ASK / BROAD кезінде өсудің шегі
M_BASE_DEEP_NEW = 0.45    # жаңа түйінде бірден Analyze+ деңгейіндегі дәлелді ой
EXPOSURE: dict[str, float] = {"FACT_LOOKUP": 0.15, "TOPIC_EXPLORE": 0.20}
EXPOSURE_DEFAULT = 0.15

EXPOSED_MAX = 0.30
MASTERED_MIN = 0.75
DECAYED_SAVED_MIN = 0.70
DECAYED_EFF_MAX = 0.55
R_UP_MIN = 0.70
PARENT_STRONG = 0.70
FEYNMAN_CAP = 0.65        # 3Ә: EXPOSED түйін бір жауаппен 0.65-тен аспайды
CAP_DIRECT = 3            # жауапсыз қалған сұрақтар: 3-тен бастап тек тікелей жауап (1-сценарий)
SECONDS_PER_DAY = 86_400.0

BRIGHT_STYLES = frozenset({"STORYTELLING_DILEMMA", "PLAYFUL_CHALLENGER"})

assert max(B_BLOOM.values()) < M_BASE_DEEP_NEW, "personarag §3.2 инварианты: max B_bloom < 0.45"


def bloom_index(level: str) -> int:
    try:
        return BLOOM_ORDER.index(level)
    except ValueError:
        return 0


# ------------------------------------------------------------------ күй


@dataclass(frozen=True)
class NodeState:
    """`student_knowledge_tree` жолы. Жолы жоқ түйін — UNSEEN (None)."""

    mastery: float  # M_saved
    bloom_level: str = "REMEMBER"
    review_count: int = 1
    fail_streak: int = 0
    error_type: str = "NONE"
    last_interaction: datetime | None = None


def effective_mastery(state: NodeState | None, now: datetime) -> float:
    """§3.1: M_eff(t) = M_saved · exp(−λ_bloom / R_i · Δt), Δt — күн."""
    if state is None:
        return 0.0
    if state.last_interaction is None:
        return state.mastery
    days = max(0.0, (now - state.last_interaction).total_seconds() / SECONDS_PER_DAY)
    lam = LAMBDA_BLOOM.get(state.bloom_level, LAMBDA_BLOOM["REMEMBER"])
    return state.mastery * math.exp(-(lam / max(1, state.review_count)) * days)


class Status(StrEnum):
    STRUGGLING_MISC = "STRUGGLING_MISC"
    UNSEEN = "UNSEEN"
    DECAYED = "DECAYED"
    STRUGGLING_GAP = "STRUGGLING_GAP"
    MASTERED = "MASTERED"
    EXPOSED = "EXPOSED"
    DEVELOPING = "DEVELOPING"


def mastery_band(m_eff: float) -> Status:
    """Тек M_eff бойынша жолақ (дайджест пен күй коды үшін)."""
    if m_eff >= MASTERED_MIN:
        return Status.MASTERED
    if m_eff <= EXPOSED_MAX:
        return Status.EXPOSED
    return Status.DEVELOPING


def node_status(state: NodeState | None, m_eff: float, error_type: str) -> Status:
    """§5.1 тексеру реті (кіріс қақпасынан кейін): бірінші сәйкес келгені алынады.
    `error_type` — ағымдағы жауаптың тегі, сақталған мән емес."""
    if error_type == "MISC":
        return Status.STRUGGLING_MISC
    if state is None:
        return Status.UNSEEN
    if state.mastery >= DECAYED_SAVED_MIN and m_eff < DECAYED_EFF_MAX:
        return Status.DECAYED
    if error_type == "GAP":
        return Status.STRUGGLING_GAP
    return mastery_band(m_eff)


# ------------------------------------------------------------------ тегтер


@dataclass(frozen=True)
class Tags:
    """1-қадамның шығысы (personarag §7). Түйін id-лері мұнда node_id-ге айналып болған."""

    toxicity_target: str = "SAFE"          # SAFE | HISTORICAL_CONTEXT | INTERPERSONAL_OR_PROFANITY
    toxicity_category: str = "NONE"
    intent: str = "FACT_LOOKUP"             # FACT_LOOKUP | TOPIC_EXPLORE | ANSWER | META_REFLECTION | FRUSTRATION | SMALL_TALK
    alignment: int = 1
    focal_node: int | None = None
    bridge_node: int | None = None
    evidence_mode: str = "PASSIVE_ASK"      # PASSIVE_ASK | ACTIVE_CLAIM | BROAD
    arg_depth: str = "NONE"                 # NONE | ECHO | FULL
    bloom_level: str = "REMEMBER"
    error_type: str = "NONE"                # NONE | GAP | MISC


class Gate(StrEnum):
    NONE = "NONE"
    HARD_ALERT = "HARD_ALERT"
    PROMPT_INJECTION = "PROMPT_INJECTION"
    META_REFLECTION = "META_REFLECTION"
    OPEN_EMPATHETIC_DIALOG = "OPEN_EMPATHETIC_DIALOG"


def gate(tags: Tags) -> Gate:
    """§6: негізгі матрицаға дейінгі сүзгі. Оқулықтағы «қырғын, сатқын» т.б. (HISTORICAL_CONTEXT) қауіпсіз.

    PROMPT_INJECTION (D87): оқушы тьютордың ережесін не рөлін өзгертпек. Дабыл жоқ, бірақ жауапқа оқулық
    берілмейді және ағаш өзгермейді. Боғауызбен бірге келсе, Hard Alert басым.
    """
    if tags.toxicity_target == "INTERPERSONAL_OR_PROFANITY":
        return Gate.HARD_ALERT
    if tags.toxicity_category == "PROMPT_INJECTION":
        return Gate.PROMPT_INJECTION
    if tags.intent == "META_REFLECTION":
        return Gate.META_REFLECTION
    if tags.intent == "FRUSTRATION":
        return Gate.OPEN_EMPATHETIC_DIALOG
    return Gate.NONE


# ------------------------------------------------------------------ жаңарту (§3.2–§3.4)


def _c_mode(evidence_mode: str) -> float:
    return 1.0 if evidence_mode == "ACTIVE_CLAIM" else C_PASSIVE


def update_node(
    state: NodeState | None,
    tags: Tags,
    *,
    now: datetime,
    weight: float = W_FOCAL,
    paste_suspect: bool = False,
) -> NodeState | None:
    """Бір түйіннің жаңа күйі. None — ағаш өзгермейді (жол ашылмайды да, жаңартылмайды да).

    * Эхо мен көшіріп қою (§4.3): көшірме күдігінде ΔM = 0, жол өзгермейді.
    * UNSEEN түйінде ΔM формуласының орнына экспозиция ережесі (§3.3); дұрыс `ACTIVE_CLAIM` жол ашады.
    * `C_mode` тек өсуді шектейді: пассив сұрақ бұрынғы деңгейді 0.25-ке түсірмейді.
    """
    if paste_suspect:
        return None
    error = tags.error_type
    if state is None:
        return _open_row(tags, now=now, weight=weight)

    m_eff = effective_mastery(state, now)
    if error in DELTA_ERR:
        if weight < W_FOCAL:
            return None  # фондық не BRIDGE түйіндегі қате фокусқа ғана жазылады
        delta = -DELTA_ERR[error]
    else:
        delta = weight * GAMMA_ARG.get(tags.arg_depth, 0.0) * B_BLOOM.get(tags.bloom_level, B_BLOOM["REMEMBER"])

    if delta > 0:
        m_new = min(max(_c_mode(tags.evidence_mode), m_eff), m_eff + delta)
        if m_eff <= EXPOSED_MAX:
            m_new = min(m_new, FEYNMAN_CAP)
        m_new = min(1.0, m_new)
    elif delta < 0:
        m_new = max(0.0, m_eff + delta)
    else:
        m_new = m_eff

    if delta > 0 and m_new >= R_UP_MIN:
        review = state.review_count + 1
    elif delta < 0:
        review = max(1, state.review_count - 1)
    else:
        review = state.review_count

    if error in DELTA_ERR:
        fail_streak = state.fail_streak + 1
    elif delta > 0 or tags.evidence_mode == "ACTIVE_CLAIM":
        fail_streak = 0
    else:
        fail_streak = state.fail_streak

    bloom = state.bloom_level
    if delta > 0 and bloom_index(tags.bloom_level) > bloom_index(bloom):
        bloom = tags.bloom_level

    return NodeState(
        mastery=round(m_new, 4),
        bloom_level=bloom,
        review_count=review,
        fail_streak=fail_streak,
        error_type=error if weight >= W_FOCAL else state.error_type,
        last_interaction=now,
    )


def _open_row(tags: Tags, *, now: datetime, weight: float) -> NodeState | None:
    """§3.3: UNSEEN түйінмен алғашқы танысу."""
    error = tags.error_type
    if error in DELTA_ERR:
        if weight < W_FOCAL:
            return None
        # Қате түсінікпен танысу да ағашқа жазылады: келесі жолы түйін EXPOSED, F_streak = 1.
        return NodeState(mastery=0.0, fail_streak=1, error_type=error, last_interaction=now)

    exposure = EXPOSURE.get(tags.intent, EXPOSURE_DEFAULT)
    gamma = GAMMA_ARG.get(tags.arg_depth, 0.0)
    if tags.evidence_mode == "ACTIVE_CLAIM" and gamma > 0:
        base = M_BASE_DEEP_NEW if bloom_index(tags.bloom_level) >= bloom_index("ANALYZE") else 0.0
        delta = weight * gamma * B_BLOOM.get(tags.bloom_level, B_BLOOM["REMEMBER"])
        m_new = min(1.0, max(exposure, base + delta))
        return NodeState(
            mastery=round(m_new, 4),
            bloom_level=tags.bloom_level,
            review_count=2 if m_new >= R_UP_MIN else 1,
            last_interaction=now,
        )
    return NodeState(mastery=exposure, last_interaction=now)


# ------------------------------------------------------------------ маршрут (§5)

SCENARIO_STYLE: dict[str, str] = {
    "1": "CLEAR_EXPLAINER",
    "2": "CLEAR_EXPLAINER",
    "3A": "CLEAR_EXPLAINER",
    "3B": "FEYNMAN_NOVICE",
    "4": "EMPATHETIC_SCAFFOLDER",
    "5": "ROOT_CONNECTOR",
    "6A": "ROOT_CONNECTOR",
    "6B": "CURIOUS_DEBATER",
    "7": "MEMORY_SPARK",
    "8": "PLAYFUL_CHALLENGER",
    "9": "STORYTELLING_DILEMMA",
    "10": "STORYTELLING_DILEMMA",
    "11": "CLEAR_EXPLAINER",
    # Кіріс қақпасы мен фокуссыз хабарлама (матрицадан тыс).
    "META": "CLEAR_EXPLAINER",
    "EMPATHY": "EMPATHETIC_SCAFFOLDER",
    "INJECTION": "CLEAR_EXPLAINER",
    "GENERAL": "CLEAR_EXPLAINER",
}

GRAPH_ACTION: dict[str, str] = {"5": "BACKWARD", "6A": "BACKWARD", "9": "FORWARD"}


@dataclass(frozen=True)
class RouteInput:
    status: Status
    tags: Tags
    m_new: float | None = None          # UNSEEN-де дұрыс ACTIVE_CLAIM болса, ашылған жолдың M-і
    fail_streak: int = 0                # жаңартылған F_streak
    has_prerequisite: bool = False
    parent_m_eff: float | None = None
    bridge_available: bool = False      # меңгерілмеген көрші түйін бар ма
    unanswered_questions: int = 0
    recent_styles: tuple[str, ...] = ()


@dataclass(frozen=True)
class Route:
    scenario: str
    style: str
    graph_action: str = "STAY"          # STAY | BACKWARD | FORWARD
    status: Status | None = None
    notes: tuple[str, ...] = field(default_factory=tuple)


def choose_scenario(inp: RouteInput) -> str:
    """§5.2 матрицасы. Алғышарты жоқ түйінде 5 → 4, 6А → 6Ә."""
    tags = inp.tags
    status = inp.status

    if status is Status.STRUGGLING_MISC:
        if not inp.has_prerequisite or inp.parent_m_eff is None:
            return "6B"
        return "6A" if inp.parent_m_eff < PARENT_STRONG else "6B"

    if status is Status.UNSEEN:
        if inp.m_new is not None:  # дұрыс ACTIVE_CLAIM: маршрут M_new бойынша қайта таңдалады (§5.1)
            return choose_scenario(replace(inp, status=mastery_band(inp.m_new), m_new=None))
        if tags.intent == "TOPIC_EXPLORE" and inp.unanswered_questions < CAP_DIRECT:
            return "2"
        return "1"

    if status is Status.DECAYED:
        deep = tags.evidence_mode == "ACTIVE_CLAIM" and tags.arg_depth == "FULL" and tags.error_type == "NONE"
        return "10" if deep else "7"

    if status is Status.STRUGGLING_GAP:
        return "5" if inp.fail_streak >= 2 and inp.has_prerequisite else "4"

    if status is Status.MASTERED:
        shallow = tags.arg_depth == "ECHO" or (
            bloom_index(tags.bloom_level) <= bloom_index("UNDERSTAND") and tags.evidence_mode != "ACTIVE_CLAIM"
        )
        if shallow:
            return "8"
        return "9" if inp.bridge_available else "10"

    if status is Status.EXPOSED:
        return "3A" if tags.evidence_mode in ("PASSIVE_ASK", "BROAD") else "3B"

    return "11"


def apply_rhythm(style: str, recent_styles: tuple[str, ...]) -> str:
    """Ырғақ ережесі (70/30): соңғы 2 қадамда жарқын мәнер болса, CLEAR_EXPLAINER."""
    if style in BRIGHT_STYLES and any(s in BRIGHT_STYLES for s in recent_styles[-2:]):
        return "CLEAR_EXPLAINER"
    return style


def route(inp: RouteInput) -> Route:
    scenario = choose_scenario(inp)
    style = apply_rhythm(SCENARIO_STYLE[scenario], inp.recent_styles)
    return Route(
        scenario=scenario,
        style=style,
        graph_action=GRAPH_ACTION.get(scenario, "STAY"),
        status=inp.status,
    )


def special_route(kind: str, recent_styles: tuple[str, ...] = ()) -> Route:
    """Кіріс қақпасы (META, EMPATHY, INJECTION) және фокуссыз хабарлама (GENERAL): ΔM = 0."""
    return Route(scenario=kind, style=apply_rhythm(SCENARIO_STYLE[kind], recent_styles))


# ------------------------------------------------------------------ көмекшілер


def state_code(alias: str, state: NodeState | None, now: datetime) -> str:
    """§2.3: ASCII ықшам күй коды, мысалы `n3:M.62/GAP/R2`; жолы жоқ түйін — `n4:U`."""
    if state is None:
        return f"{alias}:U"
    m = effective_mastery(state, now)
    return f"{alias}:M.{min(99, int(round(m * 100))):02d}/{state.error_type}/R{state.review_count}"


def paste_suspect(text: str, previous_lengths: list[int]) -> bool:
    """§4.3: қысқа жазатын оқушы кенеттен ұзын академиялық абзац қойса — көшірме күдігі."""
    if len(text) < 400 or len(previous_lengths) < 3:
        return False
    ordered = sorted(previous_lengths)
    median = ordered[len(ordered) // 2]
    return median <= 80


def next_unanswered(previous: int, tags: Tags) -> int:
    """Тьютордың сұрағын елемеген қатар қадамдар саны (1-сценарийдің `Cap ≥ 3` шарты)."""
    if tags.alignment == 0:
        return previous + 1
    if tags.intent == "ANSWER":
        return 0
    return previous


def push_style(recent: tuple[str, ...], style: str, keep: int = 4) -> tuple[str, ...]:
    return (*recent, style)[-keep:]
