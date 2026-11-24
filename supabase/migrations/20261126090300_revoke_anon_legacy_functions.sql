-- Кірмеген қолданушы (anon) ескі SECURITY DEFINER функцияларын REST арқылы шақыра алмауы керек
-- (Supabase advisor 0028). Кірген қолданушыға керектері authenticated-те қалады.
--
-- has_role өзгермейді: оны public рөліне жазылған RLS саясаттары шақырады (courses, subjects, games,
-- notifications, user_roles т.б.). anon сол кестелерді оқығанда функцияны орындау құқығы керек,
-- әйтпесе сұрау "permission denied for function has_role" қатесімен құлайды.

-- 1. Кірген қолданушыға арналған функциялар: public пен anon-нан алынады, authenticated қалады.
revoke execute on function public.can_access_course(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_course_thumbnail_storage() from public, anon;
revoke execute on function public.claim_requested_role(text) from public, anon;
revoke execute on function public.complete_lesson(uuid) from public, anon;
revoke execute on function public.delete_course_deep(text) from public, anon;
revoke execute on function public.delete_lesson_deep(uuid) from public, anon;
revoke execute on function public.delete_module_deep(uuid) from public, anon;
revoke execute on function public.delete_test_deep(text) from public, anon;
revoke execute on function public.delete_test_question_deep(uuid) from public, anon;
revoke execute on function public.get_lesson_course_id(uuid) from public, anon;
revoke execute on function public.is_platform_admin(uuid) from public, anon;
revoke execute on function public.reorder_lessons(text, text[]) from public, anon;
revoke execute on function public.reorder_modules(text, text[]) from public, anon;
revoke execute on function public.reorder_test_questions(text, text[]) from public, anon;
revoke execute on function public.submit_test_attempt(uuid, jsonb) from public, anon;
revoke execute on function public.update_my_profile(text, text, text) from public, anon;
revoke execute on function public.user_can_access_lesson(uuid, uuid) from public, anon;
revoke execute on function public.user_can_manage_course(uuid, uuid) from public, anon;

grant execute on function public.can_access_course(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_course_thumbnail_storage() to authenticated, service_role;
grant execute on function public.claim_requested_role(text) to authenticated, service_role;
grant execute on function public.complete_lesson(uuid) to authenticated, service_role;
grant execute on function public.delete_course_deep(text) to authenticated, service_role;
grant execute on function public.delete_lesson_deep(uuid) to authenticated, service_role;
grant execute on function public.delete_module_deep(uuid) to authenticated, service_role;
grant execute on function public.delete_test_deep(text) to authenticated, service_role;
grant execute on function public.delete_test_question_deep(uuid) to authenticated, service_role;
grant execute on function public.get_lesson_course_id(uuid) to authenticated, service_role;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.reorder_lessons(text, text[]) to authenticated, service_role;
grant execute on function public.reorder_modules(text, text[]) to authenticated, service_role;
grant execute on function public.reorder_test_questions(text, text[]) to authenticated, service_role;
grant execute on function public.submit_test_attempt(uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_my_profile(text, text, text) to authenticated, service_role;
grant execute on function public.user_can_access_lesson(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_manage_course(uuid, uuid) to authenticated, service_role;

-- 2. Ішкі функциялар: REST арқылы ешкім шақырмауы керек.
--    Триггер және event trigger функциялары іске қосылғанда EXECUTE құқығы тексерілмейді.
--    recompute_* функцияларын тек submit_test_attempt (SECURITY DEFINER) ішінен шақырады;
--    оларда тексеріс жоқ, сондықтан кез келген оқушының прогресін қайта есептетуге болатын.
--    get_rls_report барлық RLS саясатын ашып береді.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_course_id_from_lesson() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.recompute_course_progress(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.recompute_leaderboard(uuid) from public, anon, authenticated;
revoke execute on function public.get_rls_report() from public, anon, authenticated;

grant execute on function public.recompute_course_progress(uuid, uuid) to service_role;
grant execute on function public.recompute_leaderboard(uuid) to service_role;
grant execute on function public.get_rls_report() to service_role;

-- 3. get_rls_report тек pg_catalog көріністерін оқиды; search_path бекітіледі (advisor 0011).
alter function public.get_rls_report() set search_path = pg_catalog, pg_temp;
