"""Ойын сервисінің SQL сұраулары. Әрқайсысы `/* games:<атау> */` белгісімен басталады (журнал мен тестке)."""

# Масштаб: сұрағы бар §-тер (geimifikatsiya §5): пән → оқулық → §, әр §-тегі тест пен дебат тақырыбы саны.
SCOPES = """/* games:scopes */
select p.subject_id, s.name_kk as subject, s.sort_order, p.book, p.book_title, p.grade, p.topic_id,
       p.paragraph_no, p.paragraph_title, p.chapter_no, p.chapter, p.sort_no,
       count(*) filter (where q.kind = 'mcq') as mcq,
       count(*) filter (where q.kind = 'debate_topic') as debate
from corpus.paragraphs p
join corpus.subjects s on s.id = p.subject_id
join games.game_questions q on q.topic_id = p.topic_id and q.status = 'active'
group by p.subject_id, s.name_kk, s.sort_order, p.book, p.book_title, p.grade, p.topic_id, p.paragraph_no,
         p.paragraph_title, p.chapter_no, p.chapter, p.sort_no
order by s.sort_order, p.grade, p.book, p.sort_no, p.paragraph_no
"""

SCOPE_CHECK = """/* games:scope_check */
select p.topic_id, p.paragraph_no, p.paragraph_title,
       (select count(*) from games.game_questions q
         where q.topic_id = p.topic_id and q.status = 'active' and q.kind = 'mcq')::int as mcq,
       (select count(*) from games.game_questions q
         where q.topic_id = p.topic_id and q.status = 'active' and q.kind = 'debate_topic')::int as debate
from corpus.paragraphs p
where p.subject_id = $1::uuid and p.book = $2 and p.topic_id = any($3::text[])
"""

DISPLAY_NAME = """/* games:display_name */
select coalesce(nullif(btrim(full_name), ''), '') as name from public.profiles where user_id = $1::uuid limit 1
"""

# D52: бөлме иесімен бір сыныпта оқитын оқушы не мұғалім иенің сыныбындағы оқушы.
CAN_JOIN = """/* games:can_join */
select exists (
  select 1
  from public.classes c
  join public.class_members m on m.class_id = c.class_id and m.student_id = $2::uuid
  where c.teacher_id = $1::uuid
     or exists (select 1 from public.class_members h where h.class_id = c.class_id and h.student_id = $1::uuid)
)
"""

INSERT_ROOM = """/* games:insert_room */
insert into games.rooms (game_type, mode, host_id, host_role, scope, settings, join_code, status, started_at)
values ($1, $2, $3::uuid, $4, $5::jsonb, $6::jsonb, $7, $8, case when $8 = 'playing' then now() end)
returning room_id::text, created_at
"""

INSERT_PLAYER = """/* games:insert_player */
insert into games.room_players (room_id, user_id, seat, display_name) values ($1::uuid, $2::uuid, $3, $4)
"""

ROOM = """/* games:room */
select r.room_id::text, r.game_type, r.mode, r.host_id::text, r.host_role, r.scope, r.settings, r.join_code,
       r.status, r.result, r.created_at, r.started_at, r.finished_at, s.state, s.version
from games.rooms r left join games.match_state s on s.room_id = r.room_id
where r.room_id = $1::uuid
"""

ROOM_FOR_UPDATE = ROOM.replace("/* games:room */", "/* games:room_for_update */") + "for update of r\n"

ROOM_FOR_UPDATE_NOWAIT = ROOM.replace("/* games:room */", "/* games:room_tick */") + "for update of r skip locked\n"

ROOM_BY_CODE = """/* games:room_by_code */
select room_id::text from games.rooms where join_code = $1 and status in ('lobby', 'playing')
"""

PLAYERS = """/* games:players */
select user_id::text, seat, display_name, joined_at, left_at from games.room_players where room_id = $1::uuid order by seat
"""

DELETE_PLAYER = """/* games:delete_player */
delete from games.room_players where room_id = $1::uuid and user_id = $2::uuid
"""

MARK_LEFT = """/* games:mark_left */
update games.room_players set left_at = coalesce(left_at, now()) where room_id = $1::uuid and user_id = $2::uuid
"""

INSERT_STATE = """/* games:insert_state */
insert into games.match_state (room_id, state, version, deadline_at) values ($1::uuid, $2::jsonb, 1, $3)
"""

SAVE_STATE = """/* games:save_state */
update games.match_state set state = $2::jsonb, version = version + 1, deadline_at = $3, updated_at = now()
where room_id = $1::uuid
returning version
"""

LEASE_DEADLINE = """/* games:lease */
update games.match_state set deadline_at = $3 where room_id = $1::uuid and version = $2 returning version
"""

SET_STATUS = """/* games:set_status */
update games.rooms
set status = $2,
    result = coalesce($3::jsonb, result),
    started_at = case when $2 = 'playing' then coalesce(started_at, now()) else started_at end,
    finished_at = case when $2 in ('finished', 'abandoned') then now() else finished_at end
where room_id = $1::uuid
"""

DUE = """/* games:due */
select room_id::text from games.match_state where deadline_at <= now() order by deadline_at limit $1
"""

MY_ROOMS = """/* games:my_rooms */
select r.room_id::text, r.game_type, r.mode, r.status, r.join_code, r.created_at, r.host_id = $1::uuid as is_host,
       (select count(*) from games.room_players p where p.room_id = r.room_id and p.left_at is null)::int as players
from games.rooms r
where (r.host_id = $1::uuid
       or exists (select 1 from games.room_players p where p.room_id = r.room_id and p.user_id = $1::uuid
                  and p.left_at is null))
  and (r.status in ('lobby', 'playing') or (r.status = 'finished' and r.finished_at > now() - interval '7 days'))
order by r.status = 'finished', r.created_at desc
limit 20
"""

# D45: алдымен ойыншылар соңғы 14 күнде көрмеген сұрақ, сосын қиындығы жақыны, банк жетпесе — ең ертеде көрілгені.
PICK_QUESTION = """/* games:pick_question */
select q.question_id::text, q.topic_id, q.paragraph, q.difficulty, q.content, q.answer_key
from games.game_questions q
left join lateral (
  select max(l.created_at) as seen_at
  from games.game_answer_log l
  where l.question_id = q.question_id and l.user_id = any($2::uuid[])
) seen on true
where q.kind = 'mcq' and q.status = 'active' and q.topic_id = any($1::text[])
  and not (q.question_id = any($3::uuid[]))
order by coalesce(seen.seen_at > now() - interval '14 days', false), abs(q.difficulty - $4), seen.seen_at nulls first,
         random()
limit 1
"""

PICK_DEBATE_TOPIC = """/* games:pick_debate_topic */
select q.question_id::text, q.topic_id, q.paragraph, q.content
from games.game_questions q
left join lateral (
  select max(l.created_at) as seen_at
  from games.game_answer_log l
  where l.question_id = q.question_id and l.user_id = any($2::uuid[])
) seen on true
where q.kind = 'debate_topic' and q.status = 'active' and q.topic_id = any($1::text[])
order by seen.seen_at nulls first, random()
limit 1
"""

DEBATE_REFERENCE = """/* games:debate_reference */
select reference_context, content from games.game_questions where question_id = $1::uuid
"""

INSERT_ANSWERS = """/* games:insert_answers */
insert into games.game_answer_log (room_id, user_id, question_id, correct)
select $1::uuid, t.user_id, t.question_id, t.correct
from unnest($2::uuid[], $3::uuid[], $4::boolean[]) as t(user_id, question_id, correct)
"""

INSERT_DEBATE_ENTRY = """/* games:insert_debate_entry */
insert into games.debate_entries (room_id, user_id, round, text, moderation, alert_id)
values ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)
on conflict (room_id, user_id, round) do nothing
"""

ALERT = """/* games:alert */
insert into public.security_alerts (alert_id, source_system, student_id, severity, category, evidence_text, context_ref)
values ($1::uuid, 'games', $2::uuid, 'soft', $3, $4, $5::jsonb)
"""

UPSERT_RECORD = """/* games:upsert_record */
insert into games.practice_records (user_id, game_type, best_score, best_correct)
values ($1::uuid, 'baige', $2, $3)
on conflict (user_id, game_type) do update
set best_score = excluded.best_score, best_correct = excluded.best_correct, achieved_at = now()
where games.practice_records.best_score < excluded.best_score
"""

RECORD = """/* games:record */
select best_score, best_correct, achieved_at from games.practice_records where user_id = $1::uuid and game_type = 'baige'
"""

# Сервер күйдің проекциясын жібереді (D67): ортақ арнаға бір, әр ойыншының жеке арнасына бір хабар.
BROADCAST = """/* games:broadcast */
with pub as (
  select games.broadcast($1::uuid, null, 'state', $2::jsonb) as sent
), priv as (
  select games.broadcast($1::uuid, t.user_id, 'private', t.payload) as sent
  from unnest($3::uuid[], $4::jsonb[]) as t(user_id, payload)
)
select (select count(*) from pub) + (select count(*) from priv)
"""
