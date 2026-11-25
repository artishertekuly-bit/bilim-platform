// Ойындар (дизайн: GamesHub.dc.html; geimifikatsiya §1–§2, D42, D47): бөлме ашу, кодпен кіру,
// ашық бөлмелер, бес ойын. Ойын нәтижесі бағаға, рейтингке және профильге кірмейді (D3, D53).
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { PlusIcon } from '@/components/bl/icons';
import { Badge, Banner, Button, ButtonLink, ErrorNote, Page, PageTitle, Section } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { GAME_TITLE, GamesApiError, gamesKeys, useGamesApi, type GameType } from '@/lib/games-api';

const STATUS_LABEL = { lobby: 'күтуде', playing: 'жүріп жатыр', finished: 'аяқталды', abandoned: 'жабылды' } as const;

const Cell = ({ c }: { c: string }) => <i className="block h-3 rounded-[3px]" style={{ background: c }} />;

const CARDS: { type: GameType; text: string; art: ReactNode; wide?: boolean }[] = [
  {
    type: 'conquest',
    text: '3–6 ойыншы. Ұяшықты дұрыс жауаппен басып ал.',
    art: (
      <span aria-hidden="true" className="grid w-fit grid-cols-[repeat(3,12px)] gap-[3px]">
        {['#2563EB', '#ECE9E3', '#C2410C', '#2563EB', '#15803D', '#ECE9E3'].map((c, i) => (
          <Cell key={i} c={c} />
        ))}
      </span>
    ),
  },
  {
    type: 'checkers',
    text: '1 × 1. Әр жүріс алдында сұрақ.',
    art: (
      <span aria-hidden="true" className="flex h-[27px] items-center gap-1">
        <i className="block h-[18px] w-[18px] rounded-full bg-bl-ink" />
        <i className="box-border block h-[18px] w-[18px] rounded-full border-2 border-bl-ink bg-white" />
      </span>
    ),
  },
  {
    type: 'battleship',
    text: '1 × 1. Әр оқ алдында сұрақ.',
    art: (
      <span aria-hidden="true" className="flex h-[27px] items-center gap-[3px]">
        {['#4A4A4A', '#4A4A4A', '#4A4A4A', '#DDE7F5', '#B42323'].map((c, i) => (
          <i key={i} className="block h-3 w-3 rounded-[3px]" style={{ background: c }} />
        ))}
      </span>
    ),
  },
  {
    type: 'debate',
    text: '1 × 1. Позицияңды дәлелде.',
    art: (
      <span aria-hidden="true" className="flex h-[27px] items-center gap-1">
        <i className="block h-4 w-[22px] rounded-[8px_8px_8px_2px] bg-bl-ink" />
        <i className="block h-4 w-[22px] rounded-[8px_8px_2px_8px] bg-bl-avatar" />
      </span>
    ),
  },
  {
    type: 'baige',
    wide: true,
    text: '2–6 ойыншы. Ұпайды сақтайсың ба, әлде тәуекел етесің бе?',
    art: (
      <span aria-hidden="true" className="flex w-14 flex-none flex-col gap-1">
        <i className="block h-1.5 w-[90%] rounded-full bg-[#2563EB]" />
        <i className="block h-1.5 w-[60%] rounded-full bg-[#C2410C]" />
        <i className="block h-1.5 w-[75%] rounded-full bg-[#15803D]" />
      </span>
    ),
  },
  {
    type: 'auction',
    text: '1–6 ойыншы. Сұрақты көрмей ставка қой.',
    art: (
      <span aria-hidden="true" className="flex h-[27px] items-end gap-[3px]">
        {[10, 16, 22, 27].map((h) => (
          <i key={h} className="block w-[9px] rounded-[2px] bg-bl-ink" style={{ height: h }} />
        ))}
      </span>
    ),
  },
  {
    type: 'fact_check',
    text: '1–6 ойыншы. Тұжырым дұрыс па, қате ме?',
    art: (
      <span aria-hidden="true" className="flex h-[27px] items-center gap-1">
        <i className="flex h-[18px] w-[26px] items-center justify-center rounded-[6px] bg-bl-ink text-[11px] not-italic text-white">✓</i>
        <i className="box-border flex h-[18px] w-[26px] items-center justify-center rounded-[6px] border-2 border-bl-ink text-[11px] not-italic">✕</i>
      </span>
    ),
  },
  {
    type: 'escape_room',
    wide: true,
    text: '1–6 ойыншы. Бес құлыпты аш, кодты жинап, бөлмеден шық.',
    art: (
      <span aria-hidden="true" className="flex w-14 flex-none gap-[3px]">
        {[1, 1, 1, 0, 0].map((on, i) => (
          <i key={i} className={on ? 'block h-3 w-2 rounded-[2px] bg-bl-ink' : 'box-border block h-3 w-2 rounded-[2px] border border-bl-ink'} />
        ))}
      </span>
    ),
  },
];

export default function GamesHomePage() {
  const api = useGamesApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = useQuery({ queryKey: gamesKeys.mine, queryFn: api.myRooms });
  const record = useQuery({ queryKey: gamesKeys.record, queryFn: api.record, enabled: !isTeacher });

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) return;
    setJoining(true);
    setError(null);
    try {
      const view = await api.join(code);
      navigate(`/games/rooms/${view.room.room_id}`);
    } catch (err) {
      setError(err instanceof GamesApiError ? err.message : 'Бөлмеге кіру мүмкін болмады.');
    } finally {
      setJoining(false);
    }
  };

  const active = (mine.data ?? []).filter((r) => r.status === 'lobby' || r.status === 'playing');

  return (
    <AppShell>
      <Page>
        <PageTitle title="Ойындар" />

        {isTeacher ? (
          <>
            <ButtonLink to="/teacher/games">
              <PlusIcon size={18} />
              Сыныпқа бөлме ашу
            </ButtonLink>
            <Banner tone="info">Мұғалім бөлмені сыныпқа ашады және ойынды проектордан көрсетеді. Мұғалім өзі ойнамайды.</Banner>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink to="/games/new" size="lg" className="text-[15px]">
                <PlusIcon size={18} />
                Бөлме ашу
              </ButtonLink>
              <Button variant="secondary" className="text-[15px]" aria-expanded={codeOpen} onClick={() => setCodeOpen((v) => !v)}>
                Кодпен кіру
              </Button>
            </div>

            {codeOpen ? (
              <form onSubmit={join} className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="room-code" className="text-sm font-semibold">
                    Бөлме коды
                  </label>
                  <input
                    id="room-code"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={6}
                    placeholder="KZ7M4P"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6));
                      setError(null);
                    }}
                    className="box-border h-[52px] w-full rounded-[14px] border border-bl-field bg-white px-3.5 text-center text-[22px] font-bold tracking-[0.25em] text-bl-ink placeholder:text-bl-mute focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
                  />
                </div>
                <Button type="submit" full={false} className="px-[18px] text-[15px]" disabled={code.length !== 6} loading={joining}>
                  Кіру
                </Button>
              </form>
            ) : null}
            {error ? <Banner tone="bad">{error}</Banner> : null}
          </>
        )}

        {mine.isError ? <ErrorNote error={mine.error} onRetry={() => mine.refetch()} /> : null}
        {active.length ? (
          <Section label="Ашық бөлмелер">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {active.map((r) => (
                <div key={r.room_id} className="flex items-center gap-3 px-3.5 py-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      {GAME_TITLE[r.game_type]}
                      {r.is_host ? <Badge>Мен ашқан</Badge> : null}
                    </span>
                    <span className="text-[13px] text-bl-ink2">
                      {r.join_code ? `${r.join_code} · ` : ''}
                      {r.players} ойыншы · {STATUS_LABEL[r.status]}
                    </span>
                  </span>
                  <Link
                    to={isTeacher && r.is_host ? `/teacher/games/${r.room_id}` : `/games/rooms/${r.room_id}`}
                    className="flex h-11 items-center justify-center rounded-xl bg-bl-btn px-4 text-sm font-semibold text-white no-underline"
                  >
                    Кіру
                  </Link>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {!isTeacher ? (
          <Section label="Ойын таңдау">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {CARDS.map((card) => (
                <Link
                  key={card.type}
                  to={`/games/new?game=${card.type}`}
                  className={
                    card.wide
                      ? 'col-span-2 flex items-center gap-3.5 rounded-2xl border border-bl-line bg-white p-3.5 text-bl-ink no-underline hover:border-bl-field lg:col-span-1 lg:flex-col lg:items-start lg:gap-2'
                      : 'flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-3.5 text-bl-ink no-underline hover:border-bl-field'
                  }
                >
                  {card.art}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-base font-semibold">{GAME_TITLE[card.type]}</span>
                    <span className="text-[13px] leading-[1.4] text-bl-ink2">{card.text}</span>
                    {card.type === 'baige' && record.data?.best_score != null ? (
                      <span className="text-xs font-semibold text-bl-ink3">Жеке рекорд: {record.data.best_score} ұпай</span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
            <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">Шашки мен Теңіз шайқасында қарсылас табылмаса, ботпен ойнауға болады.</p>
          </Section>
        ) : null}
      </Page>
    </AppShell>
  );
}
