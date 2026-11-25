-- D99: Ойындар 2-кезең — «Білім аукционы», «Сенемін — Сенбеймін», «Эскейп рум».
--
-- Жаңа кесте де, жаңа баған да жоқ: ойын күйі match_state.state-те (jsonb), сұрақтар бұрынғы колодадан
-- (game / examiner / generated), true_false_fix пен escape_step кэші games.generated_questions-та (format бағанының
-- check-і оларды бұрыннан рұқсат етеді). Тек бөлменің ойын түрлерінің тізімі кеңейеді.

alter table games.rooms drop constraint rooms_game_type_check;
alter table games.rooms add constraint rooms_game_type_check
  check (game_type in ('conquest', 'checkers', 'battleship', 'debate', 'baige', 'auction', 'fact_check', 'escape_room'));

comment on column games.rooms.mode is 'multi — код/QR арқылы бір сыныптың оқушылары; bot — демо-ЖИ-мен (D48); solo — жеке жаттығу (Бәйге D55, аукцион/тұжырым/эскейп D99).';
