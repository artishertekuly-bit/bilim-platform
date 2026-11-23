// Ойындар аймағы (geimifikatsiya §1–§2, D42, D47): бес ойын, кодпен кіру, ашық бөлмелер.
// Ойын нәтижесі ресми бағаға, рейтингке және профильге кірмейді (D3, D53).
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Banner, Card, Chip, ExamScreen, SectionLabel, SimpleHeader } from '@/components/exam/ExamUi';
import { useAuth } from '@/lib/auth-context';
import { GAMES, GAME_TITLE, GamesApiError, gamesKeys, useGamesApi } from '@/lib/games-api';

const STATUS_LABEL = { lobby: 'Күтуде', playing: 'Жүріп жатыр', finished: 'Аяқталды', abandoned: 'Жабылды' } as const;

export default function GamesHomePage() {
  const api = useGamesApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = useQuery({ queryKey: gamesKeys.mine, queryFn: api.myRooms });
  const record = useQuery({ queryKey: gamesKeys.record, queryFn: api.record, enabled: !isTeacher });

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) return;
    setJoining(true);
    setError(null);
    try {
      const view = await api.join(clean);
      navigate(`/games/rooms/${view.room.room_id}`);
    } catch (err) {
      setError(err instanceof GamesApiError ? err.message : 'Бөлмеге кіру мүмкін болмады.');
    } finally {
      setJoining(false);
    }
  };

  const active = (mine.data ?? []).filter((r) => r.status === 'lobby' || r.status === 'playing');

  return (
    <ExamScreen header={<SimpleHeader title="Ойындар" to="/dashboard" label="Артқа" />}>
      <p className="m-0 text-sm text-[#5E5E5E]">
        Ойын — бағасыз жаттығу: нәтижесі емтиханға да, профильге де кірмейді. Сұрақтар оқулықтан алынады.
      </p>

      {!isTeacher ? (
        <form onSubmit={join} className="flex flex-col gap-2">
          <SectionLabel>Кодпен кіру</SectionLabel>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6))}
              placeholder="6 таңбалы код"
              inputMode="text"
              autoCapitalize="characters"
              aria-label="Бөлме коды"
              className="h-12 min-w-0 flex-1 rounded-[14px] border border-[#D9D6D0] bg-white px-4 font-mono text-lg tracking-[0.2em] outline-none focus:border-[#111111]"
            />
            <button type="submit" disabled={code.length !== 6 || joining}
              className="h-12 rounded-[14px] bg-[#121212] px-5 font-semibold text-white disabled:bg-[#D9D6D0] disabled:text-[#4A4A4A]">
              Кіру
            </button>
          </div>
          {error ? <Banner tone="bad">{error}</Banner> : null}
        </form>
      ) : (
        <Banner tone="info">Мұғалім бөлмені сыныпқа ашады: оқушылар кодпен не QR арқылы кіреді, ал сіз картаны экраннан көрсетесіз.</Banner>
      )}

      {active.length ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>Ашық бөлмелерім</SectionLabel>
          {active.map((r) => (
            <Link key={r.room_id} to={`/games/rooms/${r.room_id}`} className="no-underline text-inherit">
              <Card className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 font-semibold">{GAME_TITLE[r.game_type]}</span>
                {r.join_code ? <span className="font-mono text-sm">{r.join_code}</span> : null}
                <Chip tone={r.status === 'playing' ? 'good' : 'neutral'}>{STATUS_LABEL[r.status]}</Chip>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <SectionLabel>Ойын таңдау</SectionLabel>
        {GAMES.map((game) => {
          const modes = isTeacher ? game.modes.filter((m) => m === 'multi') : game.modes;
          return (
            <Card key={game.type} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[16px]">{game.title}</b>
                <span className="text-xs text-[#5E5E5E]">{game.players}</span>
              </div>
              <p className="m-0 text-sm text-[#4A4A4A]">{game.summary}</p>
              {game.type === 'baige' && !isTeacher && record.data?.best_score !== null && record.data?.best_score !== undefined ? (
                <p className="m-0 text-xs text-[#5E5E5E]">Жеке рекорд: {record.data.best_score} ұпай</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {modes.map((mode) => (
                  <Link key={mode} to={`/games/new/${game.type}?mode=${mode}`}
                    className={mode === 'multi'
                      ? 'rounded-full bg-[#121212] px-4 py-2 text-sm font-semibold text-white no-underline'
                      : 'rounded-full border border-[#D9D6D0] bg-white px-4 py-2 text-sm font-semibold text-[#111111] no-underline'}>
                    {mode === 'multi' ? (isTeacher ? 'Сыныпқа бөлме ашу' : 'Бөлме ашу') : mode === 'bot' ? 'Ботпен ойнау' : 'Жеке жаттығу'}
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </ExamScreen>
  );
}
