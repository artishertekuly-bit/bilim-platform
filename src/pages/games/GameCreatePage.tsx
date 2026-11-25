// Бөлме ашу (дизайн: GameSetup.dc.html; geimifikatsiya §5, D46, D49, D52): ойын, режим, ең көбі 8 §, баптаулар.
// Мұғалім үшін тек сыныптық бөлме: ол ойнамайды, бөлмені проектордан басқарады (/teacher/games/:roomId).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { CheckIcon } from '@/components/bl/icons';
import { Banner, BareScreen, Button, ErrorNote, LoadingBlock, Section, Segmented, Select, TextInput, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import {
  GAMES,
  GamesApiError,
  SOURCE_LABEL,
  gamesKeys,
  useGamesApi,
  type GameMode,
  type GameSource,
  type GameType,
  type SourcePreview,
} from '@/lib/games-api';
import { cn } from '@/lib/utils';

const MAX_TOPICS = 8;
const SOURCES: GameSource[] = ['bank', 'paragraphs', 'topic'];
const POOL_CAP = 200;

function useDebounced<T>(value: T, ms = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** D98: таңдалған көзде қанша сұрақ бар — бөлме ашпай-ақ көрінеді. */
function availabilityText(source: GameSource, p: SourcePreview): string {
  const count = p.available >= POOL_CAP ? `${POOL_CAP}+` : String(p.available);
  if (source === 'topic' && p.generate) {
    return p.available
      ? `Банкте ${count} сұрақ бар. Жетпейтін ${p.deficit} сұрақты ЖИ бір рет құрады — кейін бұл тақырып бірден ашылады.`
      : `Бұл тақырыпқа сұрақты ЖИ бір рет құрады (${p.deficit} сұрақ) — кейін бірден ашылады.`;
  }
  if (!p.ready) return `Сұрақ жеткіліксіз: ${count} / ${p.needed}. Тақырыпты басқаша жазып көріңіз.`;
  return `Дайын: ${count} сұрақ · ойын бірден басталады.`;
}

const META: Record<GameType, string> = {
  conquest: '3–6 ойыншы',
  checkers: '1 × 1 немесе ботпен',
  battleship: '1 × 1 немесе ботпен',
  debate: '1 × 1 · 3 раунд, әрқайсысы 5 мин',
  baige: '2–6 ойыншы немесе жеке жаттығу',
  auction: '1–6 ойыншы немесе жеке жаттығу',
  fact_check: '1–6 ойыншы немесе жеке жаттығу',
  escape_room: '1–6 ойыншы немесе жеке жаттығу',
};

const MODE_LABEL: Record<GameType, Partial<Record<GameMode, string>>> = {
  conquest: {},
  debate: {},
  checkers: { multi: 'Сыныптаспен', bot: 'Ботпен' },
  battleship: { multi: 'Сыныптаспен', bot: 'Ботпен' },
  baige: { multi: 'Сыныптастармен', solo: 'Жеке жаттығу' },
  auction: { multi: 'Сыныптастармен', solo: 'Жеке жаттығу' },
  fact_check: { multi: 'Сыныптастармен', solo: 'Жеке жаттығу' },
  escape_room: { multi: 'Жарыс', solo: 'Жеке өту' },
};

const NOTES: Record<GameType, string> = {
  conquest: 'Әр § (пән банкінде — әр дәуір) картада бір аймақ болады. Ойын бос ұяшықтар біткенде немесе 40 минутта аяқталады.',
  checkers: 'Әр жүріс алдында сұрақ. Тас алатын жүрісте сұрақ қиынырақ.',
  battleship: 'Кемелерді өзіңіз орналастырасыз немесе автоматты түрде қойылады.',
  debate: 'Тақырып таңдалған §-тен алынады. «Жақтаймын» мен «Қарсымын» позициялары кездейсоқ беріледі.',
  baige: 'Әр сұрақ алдында шешесіз: ұпайды сақтайсыз ба, әлде тәуекел етесіз бе.',
  auction: 'Әр ойыншыда 1000 ұпай. Сұрақтың тек тақырыбы мен қиындығын көріп ставка қоясыз: дұрыс жауап ставканы еселейді, қатесі күйдіреді.',
  fact_check: 'Тұжырымға «Сенемін» не «Сенбеймін» дейсіз. Қатесін аңғарсаңыз — жарты ұпай, дұрыс түзетсеңіз — толық ұпай.',
  escape_room: 'Бес құлып кезекпен ашылады: әрқайсысы шығыс кодының бір таңбасын береді. Қате жауап — +10 секунд айыппұл.',
};

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('box-border h-[22px] w-[22px] flex-none rounded-full bg-white', on ? 'border-[7px] border-bl-ink' : 'border-2 border-bl-field')}
    />
  );
}

export default function GameCreatePage() {
  const { gameType: legacyType } = useParams<{ gameType?: GameType }>();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const api = useGamesApi();
  const navigate = useNavigate();

  const initialType = (params.get('game') as GameType | null) ?? legacyType ?? 'conquest';
  const [gameType, setGameType] = useState<GameType>(GAMES.some((g) => g.type === initialType) ? initialType : 'conquest');
  const game = GAMES.find((g) => g.type === gameType) ?? GAMES[0];
  const allowedModes = isTeacher ? (['multi'] as GameMode[]) : game.modes;
  const requestedMode = params.get('mode') as GameMode | null;
  const [modeChoice, setModeChoice] = useState<GameMode | null>(requestedMode);
  const mode: GameMode = modeChoice && allowedModes.includes(modeChoice) ? modeChoice : allowedModes[0];

  const scopes = useQuery({ queryKey: gamesKeys.scopes, queryFn: api.scopes });
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [size, setSize] = useState(6);
  const [answerS, setAnswerS] = useState(30);
  const [stages, setStages] = useState(5);
  const [rounds, setRounds] = useState(8);
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D98: сұрақ көзі. Дебат тақырыбы оқулық мәтініне сүйенеді, сондықтан дебатта тек §-тер.
  const requestedSource = params.get('source') as GameSource | null;
  const [sourceChoice, setSourceChoice] = useState<GameSource>(
    requestedSource && SOURCES.includes(requestedSource) ? requestedSource : 'bank',
  );
  const source: GameSource = gameType === 'debate' ? 'paragraphs' : sourceChoice;
  const bankSubjects = useQuery({ queryKey: gamesKeys.bankSubjects, queryFn: api.bankSubjects, enabled: source === 'bank' });
  const [bankSubjectId, setBankSubjectId] = useState<string | null>(null);
  const bankSubject = bankSubjects.data?.find((s) => s.subject_id === bankSubjectId) ?? bankSubjects.data?.[0] ?? null;
  const [bankTopic, setBankTopic] = useState('');
  const [freeSubject, setFreeSubject] = useState('');
  const [freeTopic, setFreeTopic] = useState('');
  const query = useDebounced(source === 'bank' ? bankTopic.trim() : freeTopic.trim());
  const subjectText = useDebounced(freeSubject.trim());
  const previewEnabled =
    (source === 'bank' && Boolean(bankSubject)) || (source === 'topic' && subjectText.length >= 2 && query.length >= 2);
  const preview = useQuery({
    queryKey: ['games', 'preview', source, gameType, bankSubject?.subject_id ?? null, subjectText, query],
    queryFn: () =>
      api.preview(
        source === 'bank'
          ? { game_type: gameType, source, subject_id: bankSubject?.subject_id, topic_query: query || null }
          : { game_type: gameType, source, subject_text: subjectText, topic_query: query },
      ),
    enabled: previewEnabled,
  });
  const generating = busy && source === 'topic' && Boolean(preview.data?.generate);

  const subject = useMemo(
    () => scopes.data?.find((s) => s.subject_id === (subjectId ?? scopes.data?.[0]?.subject_id)) ?? null,
    [scopes.data, subjectId],
  );
  const selectedBook = subject?.books.find((b) => b.book === (book ?? subject.books[0]?.book)) ?? null;
  const paragraphs = (selectedBook?.paragraphs ?? []).filter((p) => (gameType === 'debate' ? p.debate > 0 : p.mcq > 0));
  const chapters = Array.from(new Set(paragraphs.map((p) => p.chapter ?? '')));
  const bookOptions = (scopes.data ?? []).flatMap((s) =>
    s.books.map((b) => ({ key: `${s.subject_id}|${b.book}`, label: `${s.title} · ${b.grade ? `${b.grade}-сынып` : b.title}` })),
  );

  const toggle = (topicId: string) =>
    setTopics((current) =>
      current.includes(topicId) ? current.filter((t) => t !== topicId) : current.length >= MAX_TOPICS ? current : [...current, topicId],
    );

  const settings: Record<string, number> =
    gameType === 'conquest'
      ? { size, answer_s: answerS }
      : gameType === 'baige'
        ? { stages }
        : gameType === 'auction' || gameType === 'fact_check'
          ? { rounds }
          : gameType === 'escape_room'
            ? { minutes }
            : gameType === 'debate'
              ? {}
              : { answer_s: answerS };

  const sourceBody =
    source === 'bank'
      ? { source, subject_id: bankSubject?.subject_id ?? null, topic_query: bankTopic.trim() || null }
      : source === 'topic'
        ? { source, subject_text: freeSubject.trim(), topic_query: freeTopic.trim() }
        : { source, subject_id: subject?.subject_id ?? null, book: selectedBook?.book ?? null, topic_ids: topics };
  const previewMatches = source === 'bank' ? query === bankTopic.trim() : query === freeTopic.trim() && subjectText === freeSubject.trim();
  const canCreate =
    source === 'paragraphs' ? Boolean(subject && selectedBook && topics.length) : previewMatches && Boolean(preview.data?.ready);

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const view = await api.createRoom({ game_type: gameType, mode, settings, ...sourceBody });
      navigate(isTeacher ? `/teacher/games/${view.room.room_id}` : `/games/rooms/${view.room.room_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof GamesApiError ? err.message : 'Бөлме ашылмады.');
    } finally {
      setBusy(false);
    }
  };

  const seg = (values: number[], value: number, onChange: (v: number) => void, label: string, suffix = '') => (
    <Segmented
      label={label}
      size="sm"
      value={String(value)}
      onChange={(id) => onChange(Number(id))}
      options={values.map((v) => ({ id: String(v), label: `${v}${suffix}` }))}
    />
  );

  return (
    <BareScreen
      header={<TopBar back={isTeacher ? '/teacher' : '/games'} backLabel="Ойындарға оралу" title={isTeacher ? 'Сыныпқа бөлме ашу' : 'Бөлме ашу'} />}
      footer={
        canCreate ? (
          <Button onClick={() => void create()} loading={busy}>
            {generating ? 'Сұрақтар құрылып жатыр…' : busy ? 'Ашылуда…' : mode === 'multi' ? 'Бөлме ашу' : 'Бастау'}
          </Button>
        ) : (
          <Button disabled>
            {source === 'paragraphs'
              ? 'Кемінде бір § таңдаңыз'
              : source === 'topic' && (freeSubject.trim().length < 2 || freeTopic.trim().length < 2)
                ? 'Пән мен тақырыпты жазыңыз'
                : preview.isFetching || !previewMatches
                  ? 'Тексерілуде…'
                  : 'Сұрақ жеткіліксіз'}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5 px-4 pb-5 pt-2">
        <Section label="Ойын">
          <div role="radiogroup" aria-label="Ойын" className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
            {GAMES.map((g) => {
              const on = g.type === gameType;
              return (
                <button
                  key={g.type}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setGameType(g.type);
                    setModeChoice(null);
                    setTopics([]);
                  }}
                  className={cn('flex min-h-[60px] w-full items-center gap-3 border-0 px-4 py-2.5 text-left text-bl-ink', on ? 'bg-[#F1EFEA]' : 'bg-white')}
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{g.title}</span>
                    <span className="text-[13px] text-bl-ink2">{META[g.type]}</span>
                  </span>
                  <RadioDot on={on} />
                </button>
              );
            })}
          </div>
        </Section>

        {allowedModes.length > 1 ? (
          <Section label="Кіммен ойнайсыз">
            <Segmented<GameMode>
              label="Режим"
              value={mode}
              onChange={setModeChoice}
              options={allowedModes.map((m) => ({ id: m, label: MODE_LABEL[gameType][m] ?? m }))}
            />
          </Section>
        ) : null}

        {gameType === 'debate' ? null : (
          <Section label="Сұрақ көзі">
            <Segmented<GameSource>
              label="Сұрақ көзі"
              value={source}
              onChange={(value) => {
                setSourceChoice(value);
                setError(null);
              }}
              options={SOURCES.map((s) => ({ id: s, label: SOURCE_LABEL[s] }))}
            />
          </Section>
        )}

        {source === 'bank' ? (
          <section className="flex flex-col gap-2.5" aria-label="Пән банкі">
            {bankSubjects.isLoading ? <LoadingBlock rows={2} /> : null}
            {bankSubjects.isError ? <ErrorNote error={bankSubjects.error} onRetry={() => bankSubjects.refetch()} /> : null}
            {bankSubjects.data && !bankSubjects.data.length ? (
              <Banner tone="info">Пән банкі әлі бос. «Еркін тақырып» көзімен кез келген тақырыпқа ойнай аласыз.</Banner>
            ) : null}
            {bankSubjects.data?.length ? (
              <>
                <label htmlFor="game-bank-subject" className="sr-only">
                  Пән
                </label>
                <Select
                  id="game-bank-subject"
                  className="h-12"
                  value={bankSubject?.subject_id ?? ''}
                  onChange={(e) => setBankSubjectId(e.target.value)}
                >
                  {bankSubjects.data.map((s) => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
                <label htmlFor="game-bank-topic" className="sr-only">
                  Тақырып сүзгісі
                </label>
                <TextInput
                  id="game-bank-topic"
                  className="h-12 text-[15px]"
                  placeholder="Тақырып (міндетті емес): бос қалса, бүкіл пән"
                  maxLength={200}
                  autoComplete="off"
                  value={bankTopic}
                  onChange={(e) => setBankTopic(e.target.value)}
                />
              </>
            ) : null}
          </section>
        ) : null}

        {source === 'topic' ? (
          <section className="flex flex-col gap-2.5" aria-label="Еркін тақырып">
            <label htmlFor="game-free-subject" className="sr-only">
              Пән
            </label>
            <TextInput
              id="game-free-subject"
              className="h-12 text-[15px]"
              placeholder="Пән, мысалы: Информатика"
              maxLength={80}
              autoComplete="off"
              value={freeSubject}
              onChange={(e) => setFreeSubject(e.target.value)}
            />
            <label htmlFor="game-free-topic" className="sr-only">
              Тақырып
            </label>
            <TextInput
              id="game-free-topic"
              className="h-12 text-[15px]"
              placeholder="Тақырып, мысалы: Excel формулалары"
              maxLength={200}
              autoComplete="off"
              value={freeTopic}
              onChange={(e) => setFreeTopic(e.target.value)}
            />
          </section>
        ) : null}

        {source !== 'paragraphs' && previewEnabled ? (
          <p className="m-0 text-sm leading-[1.4] text-bl-ink2" aria-live="polite">
            {preview.isError
              ? preview.error instanceof GamesApiError
                ? preview.error.message
                : 'Сұрақ санын тексеру мүмкін болмады.'
              : preview.data && previewMatches
                ? availabilityText(source, preview.data)
                : 'Сұрақ саны тексерілуде…'}
          </p>
        ) : null}
        {generating ? (
          <Banner tone="info">ЖИ осы тақырыпқа сұрақтарды құрып жатыр. Бұл бір рет қана, шамамен жарты минут алады.</Banner>
        ) : null}

        {source === 'paragraphs' ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-bl-ink2">Сұрақтар қай §-тен</h2>
            <span className="text-sm font-semibold tabular-nums">
              {topics.length} / {MAX_TOPICS}
            </span>
          </div>
          {scopes.isLoading ? <LoadingBlock rows={3} /> : null}
          {scopes.isError ? <ErrorNote error={scopes.error} onRetry={() => scopes.refetch()} /> : null}
          {scopes.data && !scopes.data.length ? (
            <Banner tone="info">
              {gameType === 'debate'
                ? 'Дебат тақырыбы бар § әзірге жоқ. Басқа ойынды «Пән банкі» не «Еркін тақырып» көзімен ойнай аласыз.'
                : 'Оқулық §-терінде әзірге сұрақ жоқ. «Пән банкі» не «Еркін тақырып» көзін таңдаңыз.'}
            </Banner>
          ) : null}

          {bookOptions.length > 1 ? (
            <>
              <label htmlFor="game-book" className="sr-only">
                Оқулық
              </label>
              <Select
                id="game-book"
                className="h-12"
                value={subject && selectedBook ? `${subject.subject_id}|${selectedBook.book}` : ''}
                onChange={(e) => {
                  const [s, b] = e.target.value.split('|');
                  setSubjectId(s);
                  setBook(b);
                  setTopics([]);
                }}
              >
                {bookOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </>
          ) : subject && selectedBook ? (
            <span className="flex min-h-12 items-center rounded-[14px] border border-bl-line bg-white px-3.5 text-[15px] font-semibold">
              {subject.title} · {selectedBook.grade ? `${selectedBook.grade}-сынып` : selectedBook.title}
            </span>
          ) : null}

          {selectedBook && !paragraphs.length ? (
            <Banner tone="info">Бұл оқулықта {gameType === 'debate' ? 'дебат тақырыбы' : 'ойын сұрағы'} әлі жоқ.</Banner>
          ) : null}

          {chapters.map((chapter) => (
            <div key={chapter || 'none'} role="group" aria-label={chapter || 'Параграфтар'} className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {chapter ? <span className="px-4 py-2.5 text-[13px] font-semibold text-bl-ink2">{chapter}</span> : null}
              {paragraphs
                .filter((p) => (p.chapter ?? '') === chapter)
                .map((p) => {
                  const on = topics.includes(p.topic_id);
                  const disabled = !on && topics.length >= MAX_TOPICS;
                  const [num, ...rest] = p.label.split(' ');
                  const hasNum = num.startsWith('§');
                  return (
                    <button
                      key={p.topic_id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => toggle(p.topic_id)}
                      className={cn(
                        'flex min-h-[52px] w-full items-center gap-3 border-0 px-4 py-2 text-left text-bl-ink disabled:opacity-50',
                        on ? 'bg-[#F1EFEA]' : 'bg-white',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md',
                          on ? 'bg-bl-ink text-white' : 'border-2 border-bl-field bg-white',
                        )}
                      >
                        {on ? <CheckIcon size={14} /> : null}
                      </span>
                      {hasNum ? <span className="w-10 flex-none text-sm font-bold">{num}</span> : null}
                      <span className="flex-1 text-[15px]">{hasNum ? rest.join(' ') : p.label}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </section>
        ) : null}

        {gameType === 'conquest' ? (
          <section className="flex flex-col gap-3.5 rounded-2xl border border-bl-line bg-white p-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-bl-ink2">Карта</span>
              <Segmented
                label="Карта өлшемі"
                size="sm"
                value={String(size)}
                onChange={(id) => setSize(Number(id))}
                options={[5, 6, 7].map((n) => ({ id: String(n), label: `${n} × ${n}` }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-bl-ink2">Сұраққа уақыт, секунд</span>
              {seg([20, 30, 45, 60], answerS, setAnswerS, 'Сұраққа уақыт')}
            </div>
          </section>
        ) : null}
        {gameType === 'checkers' || gameType === 'battleship' ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
            <span className="text-[13px] text-bl-ink2">Сұраққа уақыт, секунд</span>
            {seg([20, 30, 45, 60], answerS, setAnswerS, 'Сұраққа уақыт')}
          </section>
        ) : null}
        {gameType === 'baige' ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
            <span className="text-[13px] text-bl-ink2">Кезең саны · әр кезеңде 5 сұрақ</span>
            {seg([3, 4, 5, 6, 7], stages, setStages, 'Кезең саны')}
          </section>
        ) : null}
        {gameType === 'auction' || gameType === 'fact_check' ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
            <span className="text-[13px] text-bl-ink2">Раунд саны</span>
            {seg([5, 8, 10, 12], rounds, setRounds, 'Раунд саны')}
          </section>
        ) : null}
        {gameType === 'escape_room' ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
            <span className="text-[13px] text-bl-ink2">Бөлмеден шығуға уақыт, минут</span>
            {seg([5, 10, 15], minutes, setMinutes, 'Уақыт')}
          </section>
        ) : null}

        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">{NOTES[gameType]}</p>
        {error ? <Banner tone="bad">{error}</Banner> : null}
      </div>
    </BareScreen>
  );
}
