"""Tutor-дың біріккен SQL сұраулары (D88): бір оқу қадамы — 5 барып-қайту, бәрі бір statement (бөлек BEGIN/COMMIT жоқ).

  1. INTAKE      — диалог иесі, қайталанған сұраныс, бұғат, лимиттер, тарих; рұқсат болса, екі хабарлама жазылады.
  2. CANDIDATES  — entity векторлары → түйіндер, аталған id-лердің түйіндері, алдыңғы фокустың алғышарттары,
                   векторлық чанктар. Векторлар бір рет жіберіледі.
  3. GRAPH       — үміткерлердің алғышарттары, тәуелділері, көршілері және оқушы күйі. Тег шақыруымен қатар
                   жүреді, сондықтан қадамның уақытына қосылмайды.
  4. NODE_CHUNKS не DIGEST (retrieval.py).
  5. FINALIZE    — ағаш (compare-and-swap), диалог күйі, жауап, токен лимиті бір statement-те.
Hard Alert: ALERT + BLOCK.

Әр сұраудың басында `/* tutor:<атау> */` белгісі тұрады: тесттегі жалған база сұрауды осы бойынша таниды.
"""

INTAKE = """/* tutor:intake */
with conv as (
  select c.conversation_id, c.state from tutor.conversations c
  where c.conversation_id = $1::uuid and c.student_id = $2::uuid
),
prior as (
  select m.message_id, m.request_hash from tutor.messages m
  where m.conversation_id = $1::uuid and m.client_request_id = $4::uuid and m.role = 'student'
),
blk as (
  select b.blocked_until, b.blocked_reason from tutor.student_blocks b where b.student_id = $2::uuid
),
rate as (
  select count(*)::int as n, min(m.created_at) as first_at from tutor.messages m
  where m.student_id = $2::uuid and m.role = 'student' and m.created_at > $8::timestamptz
),
used as (
  select coalesce(sum(u.tokens), 0)::int as tokens from tutor.token_usage u
  where u.student_id = $2::uuid and u.day = $7::date
),
gate as (
  select exists (select 1 from conv) as conv_ok,
         exists (select 1 from prior) as has_prior,
         coalesce((select b.blocked_reason = 'teacher'
                          or (b.blocked_reason = 'cooldown' and b.blocked_until > $6::timestamptz)
                   from blk b), false) as blocked,
         (select r.n from rate r) >= $9::int as rate_limited,
         (select u.tokens from used u) >= $10::int as over_budget
),
ins_student as (
  insert into tutor.messages (conversation_id, student_id, role, text, client_request_id, request_hash, created_at)
  select $1::uuid, $2::uuid, 'student', $3, $4::uuid, $5, now()
  from gate g
  where g.conv_ok and not g.has_prior and not g.blocked and not g.rate_limited and not g.over_budget
  returning message_id
),
ins_tutor as (
  insert into tutor.messages (conversation_id, student_id, role, text, status, reply_to, created_at)
  select $1::uuid, $2::uuid, 'tutor', '', 'pending', s.message_id, now() from ins_student s
  returning message_id
),
touch as (
  update tutor.conversations c set last_message_at = now()
  where c.conversation_id = $1::uuid and exists (select 1 from ins_student)
  returning 1
),
hist as (
  select m.role, m.text, m.created_at from tutor.messages m
  where m.conversation_id = $1::uuid and m.status = 'complete' and exists (select 1 from conv)
  order by m.created_at desc, m.role desc
  limit $11::int
),
lens as (
  select char_length(m.text) as n from tutor.messages m
  where m.conversation_id = $1::uuid and m.role = 'student' and exists (select 1 from conv)
  order by m.created_at desc
  limit 10
)
select g.conv_ok, g.has_prior, g.blocked, g.rate_limited, g.over_budget,
       (select c.state from conv c) as state,
       (select p.message_id::text from prior p) as prior_id,
       (select p.request_hash from prior p) as prior_hash,
       (select b.blocked_until from blk b) as blocked_until,
       (select b.blocked_reason from blk b) as blocked_reason,
       (select r.first_at from rate r) as rate_first_at,
       (select s.message_id::text from ins_student s) as student_message_id,
       (select t.message_id::text from ins_tutor t) as tutor_message_id,
       (select coalesce(json_agg(json_build_object('role', h.role, 'text', h.text) order by h.created_at, h.role),
                        '[]'::json) from hist h) as history,
       (select coalesce(json_agg(l.n), '[]'::json) from lens l) as lengths,
       (select count(*) from touch)::int as touched
from gate g
"""

_NODE_JSON = """n.node_id, n.canonical_name, n.entity_type, left(n.description, 300) as description,
         n.lightrag_entity_ids, n.grade::int as grade, n.paragraph_no, n.topic_id, n.order_key"""

CANDIDATES = f"""/* tutor:candidates */
with q as (
  select v.vec::extensions.halfvec as vec, v.ord::int as ord
  from unnest($1::text[]) with ordinality as v(vec, ord)
),
ent as (
  select q.ord, m.entity, m.distance from q cross join lateral corpus.match_entities(q.vec, 40) m
),
vn as (
  select e.ord, n.node_id, min(e.distance) as distance
  from ent e join tutor.tutor_nodes n on n.lightrag_entity_ids @> array[e.entity] and n.is_learnable
  group by e.ord, n.node_id
),
ranked as (
  select vn.ord, vn.node_id, row_number() over (partition by vn.ord order by vn.distance, vn.node_id) as rk from vn
),
pre as (
  select p.prerequisite_node_id as node_id from tutor.tutor_prerequisites p
  join tutor.tutor_nodes n on n.node_id = p.prerequisite_node_id and n.is_learnable
  where p.node_id = $4::bigint
),
ids as (
  select r.node_id from ranked r where r.rk <= $6::int
  union select x from unnest($3::bigint[]) as x
  union select pre.node_id from pre
),
nodes as (
  select {_NODE_JSON}
  from tutor.tutor_nodes n join ids on ids.node_id = n.node_id
  where n.is_learnable
),
ch as (
  select m.chunk_id, t.content, m.distance
  from q cross join lateral corpus.match_chunks(q.vec, $5::int) m
  join corpus.chunk_text t on t.chunk_id = m.chunk_id
  where q.ord = $2::int
)
select
  (select coalesce(json_agg(json_build_object('ord', r.ord, 'node_id', r.node_id) order by r.ord, r.rk), '[]'::json)
     from ranked r where r.rk <= $6::int) as ranked,
  (select coalesce(json_agg(row_to_json(nodes)), '[]'::json) from nodes) as nodes,
  (select coalesce(json_agg(pre.node_id), '[]'::json) from pre) as prev_prereqs,
  (select coalesce(json_agg(json_build_object('chunk_id', ch.chunk_id, 'content', ch.content) order by ch.distance),
                   '[]'::json) from ch) as chunks
"""

GRAPH = f"""/* tutor:graph */
with c as (select distinct x as node_id from unnest($2::bigint[]) as x),
pre as (
  select p.node_id, p.prerequisite_node_id from tutor.tutor_prerequisites p
  join tutor.tutor_nodes n on n.node_id = p.prerequisite_node_id and n.is_learnable
  where p.node_id in (select node_id from c)
),
dep as (
  select d.of_node, d.node_id, d.rk from (
    select p.prerequisite_node_id as of_node, p.node_id,
           row_number() over (partition by p.prerequisite_node_id order by n.order_key nulls last, p.node_id) as rk
    from tutor.tutor_prerequisites p join tutor.tutor_nodes n on n.node_id = p.node_id and n.is_learnable
    where p.prerequisite_node_id in (select node_id from c)
  ) d
  where d.rk <= $3::int
),
nb as (select pre.prerequisite_node_id as node_id from pre union select dep.node_id from dep),
extra as (
  select {_NODE_JSON}
  from tutor.tutor_nodes n
  where n.node_id in (select node_id from nb) and n.node_id not in (select node_id from c) and n.is_learnable
),
st as (
  select k.node_id, k.initial_mastery, k.bloom_level, k.review_count, k.fail_streak, k.error_type, k.last_interaction
  from tutor.student_knowledge_tree k
  where k.student_id = $1::uuid and k.node_id in (select node_id from c union select node_id from nb)
),
errs as (
  select n.canonical_name, k.error_type from tutor.student_knowledge_tree k
  join tutor.tutor_nodes n on n.node_id = k.node_id
  where k.student_id = $1::uuid and k.error_type <> 'NONE' and k.fail_streak > 0
  order by k.last_interaction desc
  limit 3
)
select
  (select coalesce(json_agg(json_build_object('node_id', pre.node_id, 'prereq', pre.prerequisite_node_id)), '[]'::json)
     from pre) as prereqs,
  (select coalesce(json_agg(json_build_object('of', dep.of_node, 'node_id', dep.node_id) order by dep.of_node, dep.rk),
                   '[]'::json) from dep) as deps,
  (select coalesce(json_agg(row_to_json(extra)), '[]'::json) from extra) as nodes,
  (select coalesce(json_agg(row_to_json(st)), '[]'::json) from st) as states,
  (select coalesce(json_agg(json_build_object('name', errs.canonical_name, 'error', errs.error_type)), '[]'::json)
     from errs) as errors
"""

# Compare-and-swap: ағаш 3-сұраудағы (GRAPH) күйден есептелді. Сол жолдар содан бері өзгермесе ғана бәрі
# жазылады; өзгерсе (сол оқушының параллель қадамы), ok = false және сервис FOR UPDATE-пен баяу жолға түседі.
# Токен лимиті кез келген жағдайда осында бір рет жазылады.
FINALIZE = """/* tutor:finalize */
with input as (
  select * from unnest($2::bigint[], $3::real[], $4::text[], $5::int[], $6::int[], $7::text[],
                       $8::timestamptz[], $9::timestamptz[])
    as i(node_id, mastery, bloom, review, fail, err, li, expected)
),
cur as (
  select k.node_id, k.last_interaction from tutor.student_knowledge_tree k
  where k.student_id = $1::uuid and k.node_id in (select node_id from input)
  for update
),
chk as (
  select not exists (
    select 1 from input i left join cur c on c.node_id = i.node_id
    where c.last_interaction is distinct from i.expected
  ) as ok
),
tree as (
  insert into tutor.student_knowledge_tree as k
    (student_id, node_id, initial_mastery, bloom_level, review_count, fail_streak, error_type, last_interaction)
  select $1::uuid, i.node_id, i.mastery, i.bloom, i.review, i.fail, i.err, i.li from input i
  where (select ok from chk)
  on conflict (student_id, node_id) do update set
    initial_mastery = excluded.initial_mastery, bloom_level = excluded.bloom_level,
    review_count = excluded.review_count, fail_streak = excluded.fail_streak,
    error_type = excluded.error_type, last_interaction = excluded.last_interaction
  returning 1
),
conv as (
  update tutor.conversations c set state = $11::jsonb, last_message_at = now()
  where c.conversation_id = $10::uuid and (select ok from chk)
  returning 1
),
msg as (
  update tutor.messages m set text = $13, status = 'complete', meta = $14::jsonb, created_at = now()
  where m.message_id = $12::uuid and (select ok from chk)
  returning 1
),
tok as (
  insert into tutor.token_usage (student_id, day, tokens)
  select $1::uuid, $15::date, $16::int where $16::int > 0
  on conflict (student_id, day) do update set tokens = tutor.token_usage.tokens + excluded.tokens
  returning 1
)
select (select ok from chk) as ok, (select count(*) from tree)::int as tree_rows,
       (select count(*) from conv)::int + (select count(*) from msg)::int + (select count(*) from tok)::int as touched
"""

ALERT = """/* tutor:alert */
insert into public.security_alerts
  (alert_id, source_system, student_id, severity, category, evidence_text, context_ref)
values ($1::uuid, 'tutor', $2::uuid, 'hard', $3, $4, $5::jsonb)
"""

# Hard Alert: 24 сағаттағы екінші дабыл — мұғалім ашқанша (§6.3, D70); бұғат, журнал, тұрақты жауап, токен бір statement-те.
BLOCK = """/* tutor:block */
with recent as (
  select count(*)::int as n from tutor.safety_events e
  where e.student_id = $1::uuid and e.action in ('cooldown', 'teacher') and e.created_at > $2::timestamptz
),
decision as (
  select case when (select n from recent) >= 1 then 'teacher' else 'cooldown' end as reason
),
blk as (
  insert into tutor.student_blocks as b (student_id, blocked_until, blocked_reason, updated_at)
  select $1::uuid, case when d.reason = 'teacher' then null else $3::timestamptz end, d.reason, now() from decision d
  on conflict (student_id) do update set
    blocked_until = excluded.blocked_until, blocked_reason = excluded.blocked_reason,
    updated_at = now(), updated_by = null
  returning b.blocked_until, b.blocked_reason
),
ev as (
  insert into tutor.safety_events (student_id, action, category, alert_id, message_id)
  select $1::uuid, d.reason, $4, $5::uuid, $6::uuid from decision d
  returning 1
),
msg as (
  update tutor.messages m
  set text = case when d.reason = 'teacher' then $9 else $8 end, status = 'complete', created_at = now(),
      meta = $10::jsonb || jsonb_build_object('blocked', jsonb_build_object(
               'blocked_until', (select blocked_until from blk), 'blocked_reason', d.reason))
  from decision d
  where m.message_id = $7::uuid
  returning m.text
),
tok as (
  insert into tutor.token_usage (student_id, day, tokens)
  select $1::uuid, $11::date, $12::int where $12::int > 0
  on conflict (student_id, day) do update set tokens = tutor.token_usage.tokens + excluded.tokens
  returning 1
)
select (select blocked_until from blk) as blocked_until, (select reason from decision) as reason,
       (select text from msg) as text, (select count(*) from ev)::int + (select count(*) from tok)::int as touched
"""

ALIAS_PAGE = """/* tutor:alias_page */
select a.node_id, a.alias from tutor.tutor_node_aliases a
join tutor.tutor_nodes n on n.node_id = a.node_id and n.is_learnable
where (a.node_id, a.alias) > ($1::bigint, $2::text)
order by a.node_id, a.alias
limit $3::int
"""
