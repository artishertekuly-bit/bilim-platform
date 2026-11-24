-- D93: the exam finds the textbook § for a topic the learner writes.
-- The examiner service reads chunk vectors only through the security definer function the tutor already uses
-- (it returns chunk id, topic id and distance, never text). No access to the rag schema is granted.
-- Without this grant the topic search still works by § titles; the vector half is skipped.

grant execute on function corpus.match_chunks(extensions.halfvec, integer) to examiner_svc;
