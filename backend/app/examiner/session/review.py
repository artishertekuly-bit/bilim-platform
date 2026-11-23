"""Мұғалімнің растау, түзету және қате дабылды қалпына келтіру логикасы (api §3.9; D16, D37, D69, Т11).

Мұғалім тек өз сыныбындағы оқушының, тек сыныптың пәні бойынша бағасын көреді (api §2.1, D38, D83);
байланысы жоқ баға мен оқиға `404` қайтарады.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .dto import (
    ConfirmGradeRequest,
    DialogTurnDTO,
    FalsePositiveRequest,
    FalsePositiveResponse,
    GradeOverrideDTO,
    OverrideGradeRequest,
    ReviewQueueItem,
    ReviewQueueResponse,
    TeacherGradeActionResponse,
    TeacherGradeDetail,
)
from .errors import ExaminerError, not_found, validation
from .scoring import GradedItem, level_score


def _loads(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _hash(endpoint: str, payload: Any) -> str:
    raw = json.dumps({"endpoint": endpoint, "payload": payload}, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _replay(conn: Any, user_id: str, request_id: str, request_hash: str) -> dict | None:
    row = await conn.fetchrow(
        "select request_hash, response from examiner.request_log where user_id = $1::uuid and client_request_id = $2::uuid",
        user_id,
        request_id,
    )
    if row is None:
        return None
    if row["request_hash"] != request_hash:
        raise ExaminerError(409, "DUPLICATE_REQUEST", "Бұл сұраныстың id-і басқа мазмұнмен қолданылған.")
    return _loads(row["response"])


async def _remember(conn: Any, user_id: str, request_id: str, endpoint: str, request_hash: str, response: dict) -> None:
    await conn.execute(
        """
        insert into examiner.request_log (user_id, client_request_id, endpoint, request_hash, status_code, response)
        values ($1::uuid, $2::uuid, $3, $4, 200, $5::jsonb)
        """,
        user_id,
        request_id,
        endpoint,
        request_hash,
        json.dumps(response, ensure_ascii=False, default=str),
    )


async def _classes_ready(conn: Any) -> bool:
    """Сынып кестелері жоқ болса, мұғалім ешкімді көрмейді (D83: бұрын бәрін көретін)."""
    return bool(await conn.fetchval(
        "select to_regclass('public.classes') is not null and to_regclass('public.class_members') is not null"
    ))


def _teacher_sees(teacher: str, student: str, subject: str, class_param: str = "null") -> str:
    """api §2.1, D38: мұғалім тек өз сыныбындағы оқушыны және тек сыныптың пәні бойынша көреді."""
    return f"""exists (
            select 1
            from public.class_members cm
            join public.classes c on c.class_id = cm.class_id
            where c.teacher_id = {teacher}::uuid
              and cm.student_id = {student}
              and c.subject_id = {subject}
              and ({class_param}::uuid is null or c.class_id = {class_param}::uuid)
        )"""


async def recompute_session_result(conn: Any, session_id: str) -> tuple[float, bool, bool] | None:
    """Мұғалім растағаннан немесе түзеткеннен кейін сессия нәтижесін қайта есептейді (Т11, D37)."""
    session = await conn.fetchrow(
        "select status, level::int as level from examiner.sessions where session_id = $1::uuid",
        session_id,
    )
    if session is None or session["status"] != "completed":
        return None
    rows = await conn.fetch(
        """
        select i.tier::text as tier, q.format::text as format, i.block, g.s::int as s,
               (g.grade_status = 'final') as is_final
        from examiner.session_items i
        join examiner.questions q on q.question_id = i.question_id
        left join examiner.effective_grades g on g.item_id = i.item_id
        where i.session_id = $1::uuid
        order by i.position
        """,
        session_id,
    )
    graded = [
        GradedItem(row["tier"], row["format"], row["block"], row["s"], is_final=bool(row["is_final"]))
        for row in rows
    ]
    if any(item.s is None for item in graded if item.tier != "X3"):
        return None
    has_x3 = any(item.tier == "X3" for item in graded)
    score = level_score(session["level"], graded, x3_available=has_x3)
    await conn.execute(
        """
        update examiner.session_results
        set p = $2::numeric,
            part_d = $3::numeric,
            part_a = $4::numeric,
            mastered = $5,
            is_final = $6,
            x3_status = $7,
            x3_rating_valid = $8,
            computed_at = now()
        where session_id = $1::uuid
        """,
        session_id,
        score.p,
        score.part_d,
        score.part_a,
        score.mastered,
        score.is_final,
        score.x3_status,
        score.x3_rating_valid,
    )
    return score.p, score.is_final, score.x3_rating_valid


async def fetch_review_queue(
    conn: Any,
    teacher_id: str,
    *,
    class_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> ReviewQueueResponse:
    """D69 басымдығымен мұғалімнің растау кезегі: Т9 → шекаралық → шағым → алтын жиын → D16."""
    if not await _classes_ready(conn):
        if class_id is not None:
            raise not_found("Сынып табылмады.")
        return ReviewQueueResponse(items=[], total=0)
    if class_id is not None:
        owns = await conn.fetchval(
            "select exists (select 1 from public.classes where class_id = $1::uuid and teacher_id = $2::uuid)",
            class_id,
            teacher_id,
        )
        if not owns:
            raise not_found("Сынып табылмады.")

    visible = _teacher_sees("$1", "al.student_id", "s.subject_id", "$2")
    total = await conn.fetchval(
        f"""
        select count(*)::int
        from examiner.answer_log al
        join examiner.sessions s on s.session_id = al.session_id
        where al.grade_status = 'provisional' and {visible}
        """,
        teacher_id,
        class_id,
    )
    rows = await conn.fetch(
        f"""
        select al.answer_id::text as grade_id, al.session_id::text as session_id,
               al.student_id::text as student_id, s.level::int as level, q.format::text as format,
               al.x_tier::text as x_tier, al.review_reason, al.s::int as original_score,
               eg.s::int as effective_score, al.grade_source,
               (al.appealed_at is not null) as appealed, al.created_at
        from examiner.answer_log al
        join examiner.sessions s on s.session_id = al.session_id
        join examiner.questions q on q.question_id = al.question_id
        join examiner.effective_grades eg on eg.grade_id = al.answer_id
        where al.grade_status = 'provisional' and {visible}
        order by case al.review_reason
          when 't9_missing_quote' then 1
          when 'borderline' then 2
          when 'appeal' then 3
          when 'gold_sample' then 4
          else 5
        end, al.appealed_at asc nulls last, al.created_at asc
        limit $3::int offset $4::int
        """,
        teacher_id,
        class_id,
        limit,
        offset,
    )

    items = [
        ReviewQueueItem(
            grade_id=row["grade_id"],
            session_id=row["session_id"],
            student_id=row["student_id"],
            level=row["level"],
            format=row["format"],
            x_tier=row["x_tier"],
            review_reason=row["review_reason"],
            original_score=row["original_score"],
            effective_score=row["effective_score"],
            grade_source=row["grade_source"],
            appealed=bool(row["appealed"]),
            created_at=row["created_at"],
        )
        for row in rows
    ]
    return ReviewQueueResponse(items=items, total=int(total or 0))


async def _fetch_grade_row(conn: Any, teacher_id: str, grade_id: str) -> Any:
    if not await _classes_ready(conn):
        raise not_found("Баға табылмады.")
    visible = _teacher_sees("$2", "al.student_id", "s.subject_id")
    row = await conn.fetchrow(
        f"""
        select al.answer_id::text as grade_id, al.session_id::text as session_id, al.item_id::text as item_id,
               al.student_id::text as student_id, al.question_id::text as question_id, al.x_tier::text as x_tier,
               s.level::int as level, q.format::text as format, q.question_content, q.rubric_0_4,
               q.reference_context, al.answer, al.answer_text, al.s::int as original_score,
               eg.s::int as effective_score, al.grade_source, al.grade_status, al.review_reason,
               al.evidence_quotes, al.grade_reason, al.appeal_text, al.grader_model, al.prompt_version
        from examiner.answer_log al
        join examiner.sessions s on s.session_id = al.session_id
        join examiner.questions q on q.question_id = al.question_id
        join examiner.effective_grades eg on eg.grade_id = al.answer_id
        where al.answer_id = $1::uuid and {visible}
        """,
        grade_id,
        teacher_id,
    )
    if row is None:
        raise not_found("Баға табылмады.")  # бөтен оқушының бағасы да 404 (api §2.1)
    return row


async def fetch_grade_detail(conn: Any, teacher_id: str, grade_id: str) -> TeacherGradeDetail:
    row = await _fetch_grade_row(conn, teacher_id, grade_id)
    turn_rows = await conn.fetch(
        """
        select turn_no::int as turn_no, student_text, examiner_text
        from examiner.dialog_turns
        where item_id = $1::uuid
        order by turn_no
        """,
        row["item_id"],
    )
    override_rows = await conn.fetch(
        """
        select override_id::text as override_id, teacher_id::text as teacher_id, new_score::int as new_score,
               reason, kind, created_at
        from examiner.grade_overrides
        where grade_id = $1::uuid
        order by created_at desc, override_id desc
        """,
        grade_id,
    )
    ref = _loads(row["reference_context"]) or {}
    return TeacherGradeDetail(
        grade_id=row["grade_id"],
        session_id=row["session_id"],
        item_id=row["item_id"],
        student_id=row["student_id"],
        level=row["level"],
        format=row["format"],
        x_tier=row["x_tier"],
        question_content=_loads(row["question_content"]) or {},
        rubric_0_4=_loads(row["rubric_0_4"]),
        reference_text=ref.get("text"),
        answer=_loads(row["answer"]) or {},
        answer_text=row["answer_text"],
        dialog_turns=[
            DialogTurnDTO(turn_no=t["turn_no"], student_text=t["student_text"], examiner_text=t["examiner_text"])
            for t in turn_rows
        ],
        original_score=row["original_score"],
        effective_score=row["effective_score"],
        grade_source=row["grade_source"],
        grade_status=row["grade_status"],
        review_reason=row["review_reason"],
        evidence_quotes=_loads(row["evidence_quotes"]) or [],
        grade_reason=row["grade_reason"],
        appeal_text=row["appeal_text"],
        grader_model=row["grader_model"],
        prompt_version=row["prompt_version"],
        overrides=[
            GradeOverrideDTO(
                override_id=o["override_id"],
                teacher_id=o["teacher_id"],
                new_score=o["new_score"],
                reason=o["reason"],
                kind=o["kind"],
                created_at=o["created_at"],
            )
            for o in override_rows
        ],
    )


async def confirm_grade(conn: Any, teacher_id: str, grade_id: str, request: ConfirmGradeRequest) -> TeacherGradeActionResponse:
    endpoint = f"POST /teacher/grades/{grade_id}/confirm"
    request_id = str(request.client_request_id)
    request_hash = _hash(endpoint, {})
    replay = await _replay(conn, teacher_id, request_id, request_hash)
    if replay is not None:
        return TeacherGradeActionResponse.model_validate(replay)

    row = await _fetch_grade_row(conn, teacher_id, grade_id)
    if row["grade_status"] == "pending" or row["effective_score"] is None:
        raise validation("Баға әлі қойылмаған (pending).")

    await conn.execute(
        """
        update examiner.answer_log
        set grade_status = 'final', confirmed_by = $2::uuid, confirmed_at = coalesce(confirmed_at, now())
        where answer_id = $1::uuid
        """,
        grade_id,
        teacher_id,
    )
    await conn.execute(
        """
        update examiner.answer_vectors
        set cluster_state = 'verified', verified_by = 'teacher', state_changed_at = now()
        where answer_id = $1::uuid and cluster_state = 'candidate'
        """,
        grade_id,
    )
    recomputed = await recompute_session_result(conn, row["session_id"])
    response = TeacherGradeActionResponse(
        grade_id=grade_id,
        effective_score=row["effective_score"],
        grade_status="final",
        session_p=recomputed[0] if recomputed else None,
        session_is_final=recomputed[1] if recomputed else None,
        x3_rating_valid=recomputed[2] if recomputed else None,
    )
    await _remember(conn, teacher_id, request_id, endpoint, request_hash, response.model_dump(mode="json"))
    return response


async def override_grade(conn: Any, teacher_id: str, grade_id: str, request: OverrideGradeRequest) -> TeacherGradeActionResponse:
    endpoint = f"POST /teacher/grades/{grade_id}/override"
    request_id = str(request.client_request_id)
    request_hash = _hash(endpoint, {"new_score": request.new_score, "reason": request.reason})
    replay = await _replay(conn, teacher_id, request_id, request_hash)
    if replay is not None:
        return TeacherGradeActionResponse.model_validate(replay)

    row = await _fetch_grade_row(conn, teacher_id, grade_id)
    if row["grade_status"] == "pending" or row["original_score"] is None:
        raise validation("Провайдерден баға әлі келмеген: түзету алдымен баға қойылған соң жасалады.")

    await conn.execute(
        """
        insert into examiner.grade_overrides (grade_id, teacher_id, new_score, reason, kind)
        values ($1::uuid, $2::uuid, $3::smallint, $4, 'review')
        """,
        grade_id,
        teacher_id,
        request.new_score,
        request.reason.strip(),
    )
    await conn.execute(
        """
        update examiner.answer_log
        set grade_status = 'final', confirmed_by = $2::uuid, confirmed_at = coalesce(confirmed_at, now())
        where answer_id = $1::uuid
        """,
        grade_id,
        teacher_id,
    )
    if request.new_score != row["original_score"]:
        await conn.execute(
            """
            update examiner.answer_vectors
            set cluster_state = 'suspended', state_changed_at = now()
            where answer_id = $1::uuid and cluster_state <> 'suspended'
            """,
            grade_id,
        )
    else:
        await conn.execute(
            """
            update examiner.answer_vectors
            set cluster_state = 'verified', verified_by = 'teacher', state_changed_at = now()
            where answer_id = $1::uuid and cluster_state = 'candidate'
            """,
            grade_id,
        )

    recomputed = await recompute_session_result(conn, row["session_id"])
    response = TeacherGradeActionResponse(
        grade_id=grade_id,
        effective_score=request.new_score,
        grade_status="final",
        session_p=recomputed[0] if recomputed else None,
        session_is_final=recomputed[1] if recomputed else None,
        x3_rating_valid=recomputed[2] if recomputed else None,
    )
    await _remember(conn, teacher_id, request_id, endpoint, request_hash, response.model_dump(mode="json"))
    return response


async def mark_false_positive(
    conn: Any, teacher_id: str, alert_or_event_id: str, request: FalsePositiveRequest
) -> FalsePositiveResponse:
    endpoint = f"POST /teacher/alerts/{alert_or_event_id}/false-positive"
    request_id = str(request.client_request_id)
    request_hash = _hash(endpoint, {"reason": request.reason, "new_score": request.new_score})
    replay = await _replay(conn, teacher_id, request_id, request_hash)
    if replay is not None:
        return FalsePositiveResponse.model_validate(replay)

    if not await _classes_ready(conn):
        raise not_found("Модерация оқиғасы немесе дабыл табылмады.")
    visible = _teacher_sees("$2", "me.student_id", "s.subject_id")
    event = await conn.fetchrow(
        f"""
        select me.event_id::text as event_id, me.session_id::text as session_id, me.item_id::text as item_id,
               me.student_id::text as student_id, me.strike_no::int as strike_no, me.revoked_at
        from examiner.moderation_events me
        join examiner.sessions s on s.session_id = me.session_id
        where (me.event_id = $1::uuid or me.alert_id = $1::uuid) and {visible}
        order by me.created_at desc
        limit 1
        """,
        alert_or_event_id,
        teacher_id,
    )
    if event is None:
        raise not_found("Модерация оқиғасы немесе дабыл табылмады.")
    if event["revoked_at"] is None:
        await conn.execute(
            "update examiner.moderation_events set revoked_at = now(), revoked_by = $2::uuid where event_id = $1::uuid",
            event["event_id"],
            teacher_id,
        )

    active_strikes = await conn.fetchval(
        "select count(*)::int from examiner.moderation_events where session_id = $1::uuid and revoked_at is null",
        event["session_id"],
    )
    await conn.execute(
        """
        update examiner.sessions
        set strike_count = $2::smallint,
            status = case when status = 'blocked' and $2::int < 2 then 'active' else status end,
            blocked_until = case when status = 'blocked' and $2::int < 2 then null else blocked_until end
        where session_id = $1::uuid
        """,
        event["session_id"],
        int(active_strikes or 0),
    )

    grade_id: str | None = None
    effective_score: int | None = None
    recomputed: tuple[float, bool, bool] | None = None
    if request.new_score is not None:
        answer_row = await conn.fetchrow(
            "select answer_id::text as grade_id from examiner.answer_log where item_id = $1::uuid",
            event["item_id"],
        )
        if answer_row is not None:
            grade_id = answer_row["grade_id"]
            await conn.execute(
                """
                insert into examiner.grade_overrides (grade_id, teacher_id, new_score, reason, kind)
                values ($1::uuid, $2::uuid, $3::smallint, $4, 'false_positive')
                """,
                grade_id,
                teacher_id,
                request.new_score,
                request.reason.strip(),
            )
            await conn.execute(
                """
                update examiner.answer_log
                set grade_status = 'final', confirmed_by = $2::uuid, confirmed_at = coalesce(confirmed_at, now())
                where answer_id = $1::uuid
                """,
                grade_id,
                teacher_id,
            )
            effective_score = request.new_score
            recomputed = await recompute_session_result(conn, event["session_id"])

    response = FalsePositiveResponse(
        event_id=event["event_id"],
        session_id=event["session_id"],
        strike_count=int(active_strikes or 0),
        grade_id=grade_id,
        effective_score=effective_score,
        session_p=recomputed[0] if recomputed else None,
        session_is_final=recomputed[1] if recomputed else None,
        x3_rating_valid=recomputed[2] if recomputed else None,
    )
    await _remember(conn, teacher_id, request_id, endpoint, request_hash, response.model_dump(mode="json"))
    return response
