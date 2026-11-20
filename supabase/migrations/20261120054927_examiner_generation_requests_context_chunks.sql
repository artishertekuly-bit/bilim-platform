-- D82: L3/L4 форматтарының толық § терезесі (D79) 3-тен көп чанктан тұрады (§16–17-де 5, корпуста бір §-те
-- ең көбі 49), сондықтан Fast Lane мен Batch сұраныстары бұрынғы 1–3 шегімен жазылмайтын. Шек кодтағы
-- context.MAX_CONTEXT_CHUNKS-пен бірдей.
alter table examiner.generation_requests
  drop constraint if exists generation_requests_chunk_ids_check;
alter table examiner.generation_requests
  add constraint generation_requests_chunk_ids_check check (cardinality(chunk_ids) between 1 and 64);
