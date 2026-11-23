// Ойын бөлмесі (geimifikatsiya §5–§7, D46, D52, D53, D67): лобби (код, QR, ойыншылар) → ойын → нәтиже.
// Күй сервердікі: бет әрекет жібереді де, жаңа проекцияны жауаптан және Realtime арналарынан алады.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import BaigeView from '@/components/games/BaigeView';
import BattleshipView from '@/components/games/BattleshipView';
import CheckersView from '@/components/games/CheckersView';
import ConquestView from '@/components/games/ConquestView';
import DebateView from '@/components/games/DebateView';
import { ActionError, JoinQr, ResultsPanel, SeatDot, type ResultRow } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { Banner, Card, ExamScreen, LoadingBlock, PrimaryButton, SecondaryLink, SectionLabel, SimpleHeader } from '@/components/exam/ExamUi';
import { GAME_TITLE, GamesApiError, useGamesApi, useLiveRoom, type GameAction, type GameType } from '@/lib/games-api';

const VIEWS: Record<GameType, (props: GameViewProps) => JSX.Element> = {
  conquest: ConquestView,
  checkers: CheckersView,
  battleship: BattleshipView,
  debate: DebateView,
  baige: BaigeView,
};

const FINISH_REASON: Record<string, string> = {
  opponent_left: 'Қарсылас ойыннан шықты.',
  draw: 'Тең: қатарынан 30 жүрісте тас алынбады.',
  no_moves: 'Қарсыластың жүрісі қалмады.',
  time_limit: 'Ойынның 40 минуты бітті.',
  board_full: 'Картадағы барлық ұяшық иеленді.',
  players_left: 'Ойыншылар ойыннан шықты.',
};

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const api = useGamesApi();
  const navigate = useNavigate();
  const live = useLiveRoom(roomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = live.data;

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (err) {
      setError(err instanceof GamesApiError ? err.message : 'Әрекет орындалмады.');
      void live.refetch();
    } finally {
      setBusy(false);
    }
  };

  const act = (action: GameAction) =>
    run(async () => {
      if (!roomId) return;
      live.setView(await api.act(roomId, action));
    });

  const start = () => run(async () => { if (roomId) live.setView(await api.start(roomId)); });
  const leave = () =>
    run(async () => {
      if (!roomId) return;
      await api.leave(roomId);
      navigate('/games', { replace: true });
    });

  const title = view ? GAME_TITLE[view.room.game_type] : 'Ойын';
  const header = <SimpleHeader title={title} to="/games" label="Ойындарға оралу" />;

  if (live.isLoading) return <ExamScreen header={header}><LoadingBlock /></ExamScreen>;
  if (live.error || !view) {
    return (
      <ExamScreen header={header}>
        <Banner tone="bad">{live.error instanceof GamesApiError ? live.error.message : 'Бөлме табылмады.'}</Banner>
        <SecondaryLink to="/games">Ойындарға оралу</SecondaryLink>
      </ExamScreen>
    );
  }

  const { room } = view;
  const seated = room.players.filter((p) => !p.left);
  const isHost = Boolean(room.is_host);
  const isPlayer = view.me.seat !== null && !view.me.left;
  const GameView = VIEWS[room.game_type];
  const joinUrl = room.join_code ? `${window.location.origin}/games/join?code=${room.join_code}` : '';
  const results = (view.public?.results as ResultRow[] | undefined) ?? [];
  const reason = view.public?.finish_reason as string | undefined;

  if (room.status === 'abandoned') {
    return (
      <ExamScreen header={header}>
        <Banner tone="info">Бөлме жабылды.</Banner>
        <SecondaryLink to="/games">Ойындарға оралу</SecondaryLink>
      </ExamScreen>
    );
  }

  if (room.status === 'lobby') {
    const ready = seated.length >= room.min_players;
    return (
      <ExamScreen
        header={header}
        footer={
          <>
            {isHost ? (
              <PrimaryButton disabled={!ready || busy} onClick={() => void start()}>
                {ready ? 'Ойынды бастау' : `Кемінде ${room.min_players} ойыншы керек`}
              </PrimaryButton>
            ) : (
              <p className="m-0 text-center text-sm text-[#5E5E5E]">Бөлме иесі ойынды бастағанша күт.</p>
            )}
            <button type="button" onClick={() => void leave()} disabled={busy}
              className="h-11 rounded-[14px] text-sm font-semibold text-[#B42323]">
              {isHost ? 'Бөлмені жабу' : 'Бөлмеден шығу'}
            </button>
          </>
        }
      >
        {room.join_code ? (
          <Card className="flex flex-col items-center gap-3 p-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">Бөлме коды</span>
            <span className="font-mono text-4xl font-bold tracking-[0.25em]">{room.join_code}</span>
            <JoinQr url={joinUrl} size={room.host_role === 'teacher' ? 240 : 176} />
            <span className="text-center text-xs text-[#5E5E5E]">
              Бөлмеге тек бөлме иесімен бір сыныпта оқитын оқушылар кіре алады.
            </span>
          </Card>
        ) : null}
        <SectionLabel>Ойыншылар ({seated.length}/{room.max_players})</SectionLabel>
        <Card className="flex flex-col divide-y divide-[#ECE9E3]">
          {seated.length ? seated.map((p) => (
            <div key={p.seat} className="flex items-center gap-3 px-4 py-3">
              <SeatDot seat={p.seat} size={12} />
              <span className="flex-1 font-semibold">{p.name}</span>
              {p.user_id === view.me.user_id ? <span className="text-xs text-[#5E5E5E]">сен</span> : null}
            </div>
          )) : <span className="px-4 py-3 text-sm text-[#5E5E5E]">Әзірге ешкім кірген жоқ.</span>}
        </Card>
        {room.scope.labels.length ? (
          <p className="m-0 text-xs text-[#5E5E5E]">Тақырыптар: {room.scope.labels.join(', ')}</p>
        ) : null}
        {room.host_role === 'teacher' && isHost ? (
          <Banner tone="info">Сіз ойынға қатыспайсыз: картаны экраннан көрсетесіз, оқушылар өз телефонынан ойнайды.</Banner>
        ) : null}
        <ActionError message={error} />
      </ExamScreen>
    );
  }

  return (
    <ExamScreen
      header={header}
      footer={
        room.status === 'playing' && isPlayer ? (
          <button type="button" onClick={() => void leave()} disabled={busy}
            className="h-11 rounded-[14px] text-sm font-semibold text-[#B42323]">Ойыннан шығу</button>
        ) : room.status === 'finished' ? (
          <SecondaryLink to="/games">Ойындарға оралу</SecondaryLink>
        ) : undefined
      }
    >
      {view.public ? <GameView view={view} act={act} busy={busy} /> : <LoadingBlock />}
      <ActionError message={error} />
      {room.status === 'finished' ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>Нәтиже</SectionLabel>
          {reason && FINISH_REASON[reason] ? <p className="m-0 text-sm text-[#4A4A4A]">{FINISH_REASON[reason]}</p> : null}
          {results.length ? <ResultsPanel rows={results} /> : null}
          <p className="m-0 text-xs text-[#5E5E5E]">Ойын нәтижесі бағаға да, профильге де кірмейді.</p>
        </div>
      ) : null}
      {view.me.left ? <Banner tone="info">Сен бұл ойыннан шықтың.</Banner> : null}
    </ExamScreen>
  );
}
