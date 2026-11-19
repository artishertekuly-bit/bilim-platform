-- corpus кестелерінде RLS қосулы (dashboard арқылы қосылған), ал саясатсыз RLS сервис рөлдеріне
-- бірде-бір жолды көрсетпейді: security_invoker көрінісі corpus.paragraphs бос қайтады.
-- RLS-ті кодта бекітеміз де, сервистерге тек оқу саясатын береміз. refresh_chunk_meta() мен
-- chunk_text / entity_chunk_links көріністерін postgres иеленеді, оларға RLS кедергі емес.
alter table corpus.textbooks enable row level security;
alter table corpus.chunk_meta enable row level security;

create policy corpus_textbooks_service_read on corpus.textbooks
  for select to examiner_svc, tutor_svc using (true);

create policy corpus_chunk_meta_service_read on corpus.chunk_meta
  for select to examiner_svc, tutor_svc using (true);
