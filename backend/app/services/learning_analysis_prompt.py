from __future__ import annotations

import json
from typing import Any

from app.schemas.learning_analysis import LearningAiMode, LearningAiRequest


MAX_CONTEXT_CHARS = 18000


def _compact_json(value: Any, limit: int = MAX_CONTEXT_CHARS) -> str:
    text = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )

    if len(text) <= limit:
        return text

    return text[:limit] + "\n... [context truncated]"


def _mode_label(mode: LearningAiMode) -> str:
    if mode == LearningAiMode.student_tracker:
        return "student_ai_tracker"

    if mode == LearningAiMode.teacher_course_assistant:
        return "teacher_course_assistant"

    return "teacher_student_assistant"


def build_learning_analysis_instructions(payload: LearningAiRequest) -> str:
    role_block = (
        "Сен Bilimcorp білім беру платформасындағы AI оқу көмекшісісің.\n"
        "Сен тек берілген оқу snapshot/context ішіндегі деректерге сүйенесің.\n"
        "Сен ойдан дерек, баға, пайыз, сабақ атауы немесе оқушы туралы мәлімет қоспайсың.\n"
        "Егер дерек жеткіліксіз болса, оны ашық айтасың.\n"
        "Сен click tracking, time-on-page, сабаққа кіріп-шығу event-тері сияқты behavior tracking қолданбайсың.\n"
        "Сен диагноз, психологиялық баға, қатал үкім немесе оқушыны кінәлайтын тұжырым жасамайсың.\n"
        "Сенің жауабың қазақ тілінде, нақты, жұмсақ, педагогикалық тұрғыдан қауіпсіз болуы керек.\n"
    )

    if payload.mode == LearningAiMode.student_tracker:
        task_block = (
            "Режим: оқушыға арналған AI Tracker.\n"
            "Мақсат: оқушыға өзінің оқу нәтижесін түсінуге және келесі оқу қадамын таңдауға көмектесу.\n"
            "Тон: қарапайым, қолдаушы, оқушыға түсінікті.\n"
            "Оқушыға 'сен нашар оқисың' сияқты үкім айтпа. Оның орнына 'мына тақырыптарды қайталау пайдалы болуы мүмкін' деп айт.\n"
        )
    elif payload.mode == LearningAiMode.teacher_course_assistant:
        task_block = (
            "Режим: мұғалімге арналған AI курс көмекшісі.\n"
            "Мақсат: курс деңгейіндегі оқу нәтижелерін түсіндіріп, мұғалімге талқылауға және сабақты жақсартуға материал беру.\n"
            "Тон: педагогикалық, дәлелді, сақ.\n"
            "Мұғалімнің орнына шешім қабылдама. Тек ұсыныс және талқылау нүктелерін бер.\n"
        )
    else:
        task_block = (
            "Режим: мұғалімге арналған AI оқушы көмекшісі.\n"
            "Мақсат: нақты оқушының осы курс бойынша оқу нәтижелерін түсіндіріп, мұғалімге педагогикалық қолдау ұсыныстарын беру.\n"
            "Тон: сақ, адамға құрметпен қарайтын, педагогикалық.\n"
            "Оқушыға диагноз қойма, мінезіне баға берме, тек оқу нәтижелері бойынша ұсыныс айт.\n"
        )

    output_block = (
        "Жауап құрылымы:\n"
        "1. Қысқаша қорытынды\n"
        "2. Негізгі байқаулар\n"
        "3. Ұсыныстар\n"
        "4. Келесі нақты қадамдар\n"
        "5. Педагогикалық ескерту\n\n"
        "Формат:\n"
        "- Markdown қолдан.\n"
        "- Ұзын емес, бірақ толық жауап бер.\n"
        "- Егер weakLessons немесе recommendations бар болса, оларды нақты ата.\n"
        "- Егер дерек аз болса, 'дерек жеткіліксіз' деп айт және қандай дерек керек екенін түсіндір.\n"
    )

    return "\n".join([role_block, task_block, output_block])


def build_learning_analysis_input(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str:
    return (
        f"MODE: {_mode_label(payload.mode)}\n"
        f"ROLE: {payload.role}\n"
        f"SELECTED_SUGGESTION_ID: {payload.selected_suggestion_id or 'none'}\n\n"
        f"USER_QUESTION:\n{payload.prompt.strip()}\n\n"
        f"LEARNING_CONTEXT_JSON:\n{_compact_json(context)}\n"
    )