-- D90: білім басқармасының басшысы (head) рөлі.
-- Жаңа enum мәнін сол транзакцияда қолдануға болмайды, сондықтан ол бөлек migration-да қосылады.
alter type public.app_role add value if not exists 'head';
