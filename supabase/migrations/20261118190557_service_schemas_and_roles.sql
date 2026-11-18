-- Examiner мен Tutor сервистерінің схемалары және рөлдері.
-- Негізі: architect/v2/ortaq-infraqurylym.md §1, §9; README D1, D12, D15; api-kelisimderi.md §1.
--
--   examiner  — тек examiner_svc
--   tutor     — тек tutor_svc
--
-- Бір жүйе жазған деректі екіншісі оқымайды (D1): examiner_svc tutor схемасын көрмейді,
-- tutor_svc examiner схемасын көрмейді. Екі схема да Supabase Data API-ына (PostgREST)
-- ашылмайды: anon, authenticated және service_role рөлдерінде оларға USAGE жоқ.
--
-- Рөлдер NOLOGIN және паролсіз құрылады. Пароль мен LOGIN migration-нан тыс, бір рет
-- орнатылады (rag схемасындағы lightrag_app үлгісімен):
--   alter role examiner_svc with login password '<құпия>';
-- Ашық пароль тек сервистің .env файлында тұрады.
--
-- Бұл файлда әдейі жоқ құқықтар (api-kelisimderi.md §10 реті бойынша):
--   * rag схемасын оқу — chunk_meta кестесімен бірге, 3-қадамда;
--   * public.security_alerts кестесіне INSERT — кесте платформа қадамында (6-қадам) құрылады;
--   * games схемасы мен games_svc рөлі — ойындар қадамында (8-қадам).

-- 1. Рөлдер
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'examiner_svc') then
    create role examiner_svc nologin noinherit nocreatedb nocreaterole noreplication;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'tutor_svc') then
    create role tutor_svc nologin noinherit nocreatedb nocreaterole noreplication;
  end if;
end
$$;

alter role examiner_svc connection limit 30;
alter role tutor_svc connection limit 30;

-- Рөлдің әр сессиясы тек өз схемасын және extensions-ті көреді (pooler арқылы да жұмыс істейді).
alter role examiner_svc set search_path = examiner, extensions;
alter role tutor_svc set search_path = tutor, extensions;

-- Онлайн сұраныстар қысқа болуы керек; ұзақ құлып пен ұмытылған транзакция пулды толтырмайды.
alter role examiner_svc set statement_timeout = '15s';
alter role tutor_svc set statement_timeout = '15s';
alter role examiner_svc set lock_timeout = '5s';
alter role tutor_svc set lock_timeout = '5s';
alter role examiner_svc set idle_in_transaction_session_timeout = '30s';
alter role tutor_svc set idle_in_transaction_session_timeout = '30s';

-- 2. Схемалар
create schema if not exists examiner;
create schema if not exists tutor;

revoke all on schema examiner from public, anon, authenticated, service_role;
revoke all on schema tutor from public, anon, authenticated, service_role;

grant usage on schema examiner to examiner_svc;
grant usage on schema tutor to tutor_svc;

-- vector типі мен оның операторлары extensions схемасында (жауап векторлары, bagalau §6).
grant usage on schema extensions to examiner_svc, tutor_svc;

comment on schema examiner is 'AI Examiner: сұрақ банкі, сессиялар, жауаптар, бағалар (architect/v2/ai_examiner.md, bagalau-zhuiesi.md). Тек examiner_svc.';
comment on schema tutor is 'AI Tutor: диалогтар, оқушы ағашы (architect/v2/lightrag_personarag.md). Тек tutor_svc. Кестелері 7-қадамда.';
