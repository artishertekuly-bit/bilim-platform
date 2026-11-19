-- D65: Е1 — басымдық. Бос қор жетпесе, ең ерте бекітілген сұрақ қайта беріледі (ai_examiner §5.2, §5.5).
alter table examiner.exam_item_leases
  add column leased_at timestamptz not null default now();

comment on column examiner.exam_item_leases.leased_at is
  'Сұрақ соңғы рет қай кезде бекітілді. Бос қор жетпегенде ең ерте бекітілгені бірінші қайта беріледі (D65).';
