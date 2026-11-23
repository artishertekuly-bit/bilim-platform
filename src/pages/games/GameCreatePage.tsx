// Бөлме ашу (geimifikatsiya §5, D46, D49): ойын, масштаб (пән → оқулық → §) және баптаулар.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Banner, Card, ExamScreen, LoadingBlock, PrimaryButton, SectionLabel, SimpleHeader } from '@/components/exam/ExamUi';
import {
  GAMES,
  GamesApiError,
  gamesKeys,
  useGamesApi,
  type GameMode,
  type GameType,
} from '@/lib/games-api';
import { cn } from '@/lib/utils';

const MAX_TOPICS = 8;

function Choice<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold',
            value === o.value ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#D9D6D0] bg-white')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function GameCreatePage() {
  const { gameType } = useParams<{ gameType: GameType }>();
  const [params] = useSearchParams();
  const api = useGamesApi();
  const navigate = useNavigate();
  const game = GAMES.find((g) => g.type === gameType);
  const mode = (params.get('mode') as GameMode) || 'multi';
  const scopes = useQuery({ queryKey: gamesKeys.scopes, queryFn: api.scopes });
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [size, setSize] = useState(6);
  const [answerS, setAnswerS] = useState(30);
  const [stages, setStages] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = useMemo(
    () => scopes.data?.find((s) => s.subject_id === (subjectId ?? scopes.data?.[0]?.subject_id)) ?? null,
    [scopes.data, subjectId],
  );
  const selectedBook = subject?.books.find((b) => b.book === (book ?? subject.books[0]?.book)) ?? null;
  const paragraphs = (selectedBook?.paragraphs ?? []).filter((p) => (gameType === 'debate' ? p.debate > 0 : p.mcq > 0));
  const chapters = Array.from(new Set(paragraphs.map((p) => p.chapter ?? '')));

  if (!game) return <ExamScreen header={<SimpleHeader title="Ойын" to="/games" />}><Banner tone="bad">Мұндай ойын жоқ.</Banner></ExamScreen>;

  const toggle = (topicId: string) =>
    setTopics((current) =>
      current.includes(topicId) ? current.filter((t) => t !== topicId) : current.length >= MAX_TOPICS ? current : [...current, topicId],
    );

  const settings: Record<string, number> =
    game.type === 'conquest' ? { size, answer_s: answerS }
      : game.type === 'baige' ? { stages }
        : game.type === 'debate' ? {} : { answer_s: answerS };

  const create = async () => {
    if (!subject || !selectedBook || !topics.length) return;
    setBusy(true);
    setError(null);
    try {
      const view = await api.createRoom({
        game_type: game.type, mode, subject_id: subject.subject_id, book: selectedBook.book, topic_ids: topics, settings,
      });
      navigate(`/games/rooms/${view.room.room_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof GamesApiError ? err.message : 'Бөлме ашылмады.');
    } finally {
      setBusy(false);
    }
  };

  const modeLabel = mode === 'bot' ? 'ботпен' : mode === 'solo' ? 'жеке жаттығу' : 'бөлме';

  return (
    <ExamScreen
      header={<SimpleHeader title={`${game.title} · ${modeLabel}`} to="/games" label="Артқа" />}
      footer={<PrimaryButton disabled={busy || !topics.length} onClick={() => void create()}>{mode === 'multi' ? 'Бөлме ашу' : 'Бастау'}</PrimaryButton>}
    >
      <p className="m-0 text-sm text-[#4A4A4A]">{game.summary}</p>
      {scopes.isLoading ? <LoadingBlock /> : null}
      {scopes.data && !scopes.data.length ? (
        <Banner tone="warn">Ойын банкі әлі дайын емес: сұрақтар оқулықтан генерацияланғанда ойындар ашылады.</Banner>
      ) : null}
      {subject ? (
        <>
          <SectionLabel>Пән мен оқулық</SectionLabel>
          {scopes.data && scopes.data.length > 1 ? (
            <Choice value={subject.subject_id} onChange={(v) => { setSubjectId(v); setBook(null); setTopics([]); }}
              options={scopes.data.map((s) => ({ value: s.subject_id, label: s.title }))} />
          ) : null}
          <Choice value={selectedBook?.book ?? ''} onChange={(v) => { setBook(v); setTopics([]); }}
            options={subject.books.map((b) => ({ value: b.book, label: b.grade ? `${b.grade}-сынып` : b.title }))} />
          <SectionLabel>Тақырыптар (§, {topics.length}/{MAX_TOPICS})</SectionLabel>
          {game.type === 'conquest' ? <p className="m-0 text-xs text-[#5E5E5E]">Әр § — картаның бір аймағы.</p> : null}
          {chapters.map((chapter) => (
            <Card key={chapter || 'none'} className="flex flex-col divide-y divide-[#ECE9E3]">
              {chapter ? <span className="px-4 py-2 text-xs font-semibold text-[#5E5E5E]">{chapter}</span> : null}
              {paragraphs.filter((p) => (p.chapter ?? '') === chapter).map((p) => (
                <label key={p.topic_id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm">
                  <input type="checkbox" checked={topics.includes(p.topic_id)} onChange={() => toggle(p.topic_id)}
                    className="h-4 w-4 accent-[#111111]" />
                  <span className="flex-1">{p.label}</span>
                  <span className="text-xs text-[#5E5E5E]">{game.type === 'debate' ? `${p.debate} тақ.` : `${p.mcq} сұр.`}</span>
                </label>
              ))}
            </Card>
          ))}
        </>
      ) : null}

      {game.type === 'conquest' ? (
        <>
          <SectionLabel>Карта</SectionLabel>
          <Choice<number> value={size} onChange={setSize} options={[5, 6, 7].map((n) => ({ value: n, label: `${n} × ${n}` }))} />
        </>
      ) : null}
      {game.type === 'conquest' || game.type === 'checkers' || game.type === 'battleship' ? (
        <>
          <SectionLabel>Сұраққа уақыт</SectionLabel>
          <Choice<number> value={answerS} onChange={setAnswerS} options={[20, 30, 45, 60].map((n) => ({ value: n, label: `${n} с` }))} />
        </>
      ) : null}
      {game.type === 'baige' ? (
        <>
          <SectionLabel>Кезең саны</SectionLabel>
          <Choice<number> value={stages} onChange={setStages} options={[3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
        </>
      ) : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
    </ExamScreen>
  );
}
