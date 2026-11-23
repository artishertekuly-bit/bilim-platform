// Ойын бөлмесі (дизайн: GameWaiting.dc.html, GameRoom.dc.html, GameResult.dc.html; geimifikatsiya §5–§7,
// D46, D52, D53, D67): лобби (код, ойыншылар) → ойын → нәтиже. Күй сервердікі: бет әрекет жібереді,
// жаңа проекцияны жауаптан және Realtime арналарынан алады.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Banner, BareScreen, Button, ButtonLink, ConfirmSheet, LoadingBlock, StateCard, TopBar } from '@/components/bl/ui';
import BaigeView from '@/components/games/BaigeView';
import BattleshipView from '@/components/games/BattleshipView';
import CheckersView from '@/components/games/CheckersView';
import ConquestView from '@/components/games/ConquestView';
import DebateView from '@/components/games/DebateView';
import { ActionError, type ResultRow } from '@/components/games/GameUi';
import { PlayerGrid, Podium, ResultsTable, RoomCode } from '@/components/games/RoomParts';
import type { GameViewProps } from '@/components/games/types';
import { GAME_TITLE, GamesApiError, useGamesApi, useLiveRoom, type GameAction, type GameType } from '@/lib/games-api';
import { FINISH_REASON, FINISH_TITLE } from '@/lib/games-ui';

const VIEWS: Record<GameType, (props: GameViewProps) => JSX.Element> = {
  conquest: ConquestView,
  checkers: CheckersView,
  battleship: BattleshipView,
  debate: DebateView,
  baige: BaigeView,
};


export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const api = useGamesApi();
  const navigate = useNavigate();
  const live = useLiveRoom(roomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  const start = () =>
    run(async () => {
      if (roomId) live.setView(await api.start(roomId));
    });
  const leave = () =>
    run(async () => {
      if (!roomId) return;
      await api.leave(roomId);
      navigate('/games', { replace: true });
    });

  const title = view ? GAME_TITLE[view.room.game_type] : 'Ойын';

  if (live.isLoading) {
    return (
      <BareScreen header={<TopBar back="/games" backLabel="Ойындарға оралу" title={title} />}>
        <div className="px-4 pt-2">
          <LoadingBlock rows={3} />
        </div>
      </BareScreen>
    );
  }
  if (live.error || !view) {
    return (
      <BareScreen header={<TopBar back="/games" backLabel="Ойындарға оралу" title={title} />}>
        <div className="px-4 pt-2">
          <StateCard mark="404" title="Бөлме табылмады" text={live.error instanceof GamesApiError ? live.error.message : 'Бөлме жабылған болуы мүмкін.'}>
            <ButtonLink to="/games">Ойындарға оралу</ButtonLink>
          </StateCard>
        </div>
      </BareScreen>
    );
  }

  const { room } = view;
  const seated = room.players.filter((p) => !p.left);
  const isHost = Boolean(room.is_host);
  const isPlayer = view.me.seat !== null && !view.me.left;
  const GameView = VIEWS[room.game_type];
  const results = (view.public?.results as ResultRow[] | undefined) ?? [];
  const reason = view.public?.finish_reason as string | undefined;
  const oneVsOne = room.max_players === 2;

  if (room.status === 'abandoned') {
    return (
      <BareScreen header={<TopBar back="/games" backLabel="Ойындарға оралу" title={title} />}>
        <div className="px-4 pt-2">
          <StateCard mark="—" title="Бөлме жабылды" text="Бөлме иесі бөлмені жапты немесе ойыншылар шығып кетті.">
            <ButtonLink to="/games">Ойындарға оралу</ButtonLink>
          </StateCard>
        </div>
      </BareScreen>
    );
  }

  if (room.status === 'lobby') {
    const ready = seated.length >= room.min_players;
    return (
      <BareScreen
        header={<TopBar onBack={() => setConfirmLeave(true)} backLabel="Бөлмеден шығу" title={`${title} · бөлме`} />}
        footer={
          isHost ? (
            <Button disabled={!ready} loading={busy} onClick={() => void start()}>
              {ready ? 'Бастау' : oneVsOne ? 'Қарсылас күтілуде…' : `Кемінде ${room.min_players} ойыншы керек`}
            </Button>
          ) : (
            <Button disabled>Бөлме иесі бастағанша күтіңіз</Button>
          )
        }
      >
        <div className="flex flex-col gap-4 px-4 pb-5 pt-2">
          {room.join_code ? (
            <RoomCode code={room.join_code} hint="Кодты сыныптасыңызға беріңіз. Ол «Ойындар › Кодпен кіру» арқылы қосылады." />
          ) : null}
          <PlayerGrid players={seated} max={room.max_players} meId={view.me.user_id} />
          {isHost && oneVsOne && (room.game_type === 'checkers' || room.game_type === 'battleship') ? (
            <section className="flex items-center gap-3 rounded-2xl border border-bl-line bg-white px-4 py-3.5">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">Қарсылас табылмады ма?</span>
                <span className="text-[13px] text-bl-ink2">Ботпен ойнаңыз: сұрақтар сол §-тен</span>
              </span>
              <ButtonLink to={`/games/new?game=${room.game_type}&mode=bot`} variant="secondary" size="sm" full={false}>
                Ботпен
              </ButtonLink>
            </section>
          ) : null}
          {room.game_type === 'debate' ? (
            <p className="m-0 text-sm leading-[1.45] text-bl-ink2">Позициялар ойын басталғанда кездейсоқ беріледі. Мәтін модерациядан өтеді.</p>
          ) : null}
          {room.scope.labels.length ? <p className="m-0 text-[13px] text-bl-ink2">Тақырыптар: {room.scope.labels.join(', ')}</p> : null}
          <ActionError message={error} />
        </div>
        <ConfirmSheet
          open={confirmLeave}
          onClose={() => setConfirmLeave(false)}
          title={isHost ? 'Бөлмені жабасыз ба?' : 'Бөлмеден шығасыз ба?'}
          description={isHost ? 'Бөлмедегі ойыншылар да шығып қалады.' : 'Кодпен қайта кіре аласыз.'}
          cancelLabel="Қалу"
          confirmLabel={isHost ? 'Жабу' : 'Шығу'}
          busy={busy}
          onConfirm={() => void leave()}
        />
      </BareScreen>
    );
  }

  if (room.status === 'finished') {
    const winner = results.find((r) => r.place === 1);
    const meWon = winner && winner.seat !== undefined && winner.seat === view.me.seat;
    return (
      <BareScreen
        header={<TopBar back="/games" backLabel="Жабу" title={FINISH_TITLE[room.game_type]} />}
        footer={
          <>
            <ButtonLink to={`/games/new?game=${room.game_type}${room.mode !== 'multi' ? `&mode=${room.mode}` : ''}`}>Қайта ойнау</ButtonLink>
            <ButtonLink to="/games" variant="secondary" size="md">
              Ойындарға оралу
            </ButtonLink>
          </>
        }
      >
        <div className="flex flex-col gap-[18px] px-4 pb-5 pt-2">
          {winner ? <h1 className="m-0 text-[28px] font-bold leading-[1.2]">{meWon ? 'Сіз жеңдіңіз' : `${winner.name} жеңді`}</h1> : null}
          {reason && FINISH_REASON[reason] ? <p className="m-0 text-sm text-bl-ink3">{FINISH_REASON[reason]}</p> : null}
          {results.length >= 3 ? <Podium rows={results} meSeat={view.me.seat} /> : null}
          {results.length ? <ResultsTable rows={results} meSeat={view.me.seat} /> : null}
          {view.public ? <GameView view={view} act={act} busy={busy} /> : null}
          <p className="m-0 text-xs text-bl-ink2">Ойын нәтижесі бағаға да, профильге де кірмейді.</p>
        </div>
      </BareScreen>
    );
  }

  return (
    <BareScreen
      header={
        <TopBar
          onBack={isPlayer ? () => setConfirmLeave(true) : () => navigate('/games')}
          backLabel={isPlayer ? 'Ойыннан шығу' : 'Ойындарға оралу'}
          title={title}
        />
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-6 pt-1">
        {view.public ? <GameView view={view} act={act} busy={busy} /> : <LoadingBlock rows={3} />}
        <ActionError message={error} />
        {view.me.left ? <Banner tone="info">Сіз бұл ойыннан шықтыңыз.</Banner> : null}
      </div>
      <ConfirmSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Ойыннан шығасыз ба?"
        description={oneVsOne ? 'Шықсаңыз, қарсылас жеңген болып саналады.' : 'Ойын сізсіз жалғасады. Нәтижеңіз кестеде қалады.'}
        cancelLabel="Жалғастыру"
        confirmLabel="Шығу"
        busy={busy}
        onConfirm={() => void leave()}
      />
    </BareScreen>
  );
}
