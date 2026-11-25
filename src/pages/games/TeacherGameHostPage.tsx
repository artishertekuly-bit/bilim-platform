// Мұғалімнің проектордағы бөлмесі (дизайн: TeacherGameHost.dc.html; D46, D52): лобби — үлкен код пен QR,
// ойын — карта мен ұпай, нәтиже — тұғыр. Мұғалім ойнамайды: тек көрсетеді және бастайды.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BackIcon } from '@/components/bl/icons';
import { Banner, Button, ButtonLink, ConfirmSheet, LoadingBlock, StateCard } from '@/components/bl/ui';
import AuctionView from '@/components/games/AuctionView';
import BaigeView from '@/components/games/BaigeView';
import BattleshipView from '@/components/games/BattleshipView';
import CheckersView from '@/components/games/CheckersView';
import ConquestView from '@/components/games/ConquestView';
import DebateView from '@/components/games/DebateView';
import EscapeRoomView from '@/components/games/EscapeRoomView';
import FactCheckView from '@/components/games/FactCheckView';
import { ActionError, JoinQr, type ResultRow } from '@/components/games/GameUi';
import { PlayerGrid, Podium } from '@/components/games/RoomParts';
import type { GameViewProps } from '@/components/games/types';
import { GAME_TITLE, GamesApiError, SEAT_COLORS, useGamesApi, useLiveRoom, type GameType } from '@/lib/games-api';
import { FINISH_REASON } from '@/lib/games-ui';

const VIEWS: Record<GameType, (props: GameViewProps) => JSX.Element> = {
  conquest: ConquestView,
  checkers: CheckersView,
  battleship: BattleshipView,
  debate: DebateView,
  baige: BaigeView,
  auction: AuctionView,
  fact_check: FactCheckView,
  escape_room: EscapeRoomView,
};

type Standing = { seat: number; name: string; score?: number; left?: boolean };

export default function TeacherGameHostPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const api = useGamesApi();
  const navigate = useNavigate();
  const live = useLiveRoom(roomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const view = live.data;

  const run = async (op: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof GamesApiError ? err.message : 'Әрекет орындалмады.');
      void live.refetch();
    } finally {
      setBusy(false);
    }
  };

  const header = (title: string) => (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-bl-line bg-white px-4 py-4 lg:px-8 lg:py-5">
      <Link to="/teacher" className="flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-bl-ink no-underline">
        <BackIcon size={20} />
        Панель
      </Link>
      <h1 className="m-0 min-w-[200px] flex-1 text-lg font-bold lg:text-[22px]">{title}</h1>
      {view && (view.room.status === 'lobby' || view.room.status === 'playing') ? (
        <Button variant="secondary" size="sm" full={false} onClick={() => setConfirmClose(true)}>
          Бөлмені жабу
        </Button>
      ) : null}
    </header>
  );

  if (live.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
        {header('Ойын бөлмесі')}
        <div className="mx-auto max-w-[960px] p-6">
          <LoadingBlock rows={3} />
        </div>
      </div>
    );
  }
  if (live.error || !view) {
    return (
      <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
        {header('Ойын бөлмесі')}
        <div className="mx-auto max-w-[480px] p-6">
          <StateCard mark="404" title="Бөлме табылмады" text={live.error instanceof GamesApiError ? live.error.message : 'Бөлме жабылған болуы мүмкін.'}>
            <ButtonLink to="/teacher">Панельге оралу</ButtonLink>
          </StateCard>
        </div>
      </div>
    );
  }

  const { room } = view;
  const title = `${GAME_TITLE[room.game_type]}${room.scope.labels.length ? ` · ${room.scope.labels[0]}${room.scope.labels.length > 1 ? ` +${room.scope.labels.length - 1}` : ''}` : ''}`;
  const seated = room.players.filter((p) => !p.left);
  const GameView = VIEWS[room.game_type];
  const joinUrl = room.join_code ? `${window.location.origin}/games/join?code=${room.join_code}` : '';
  const results = (view.public?.results as ResultRow[] | undefined) ?? [];
  const standings = ((view.public?.players as Standing[] | undefined) ?? [])
    .filter((p) => typeof p.score === 'number')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const reason = view.public?.finish_reason as string | undefined;

  const closeSheet = (
    <ConfirmSheet
      open={confirmClose}
      onClose={() => setConfirmClose(false)}
      title="Бөлмені жабасыз ба?"
      description="Ойын тоқтайды, оқушылар бөлмеден шығады. Ойын нәтижесі сақталмайды."
      cancelLabel="Жалғастыру"
      confirmLabel="Жабу"
      busy={busy}
      onConfirm={() =>
        void run(async () => {
          if (!roomId) return;
          await api.leave(roomId);
          navigate('/teacher', { replace: true });
        })
      }
    />
  );

  if (room.status === 'abandoned') {
    return (
      <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
        {header(title)}
        <div className="mx-auto max-w-[480px] p-6">
          <StateCard mark="—" title="Бөлме жабылды">
            <ButtonLink to="/teacher/games">Жаңа бөлме</ButtonLink>
          </StateCard>
        </div>
      </div>
    );
  }

  if (room.status === 'lobby') {
    const ready = seated.length >= room.min_players;
    return (
      <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
        {header(title)}
        <main className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-6 p-4 lg:p-8">
          <section className="flex min-w-0 flex-[1_1_420px] flex-col items-center gap-[18px] rounded-[20px] border border-bl-line bg-white p-6 lg:p-8">
            <span className="text-lg font-semibold text-bl-ink2">Ойындар › Кодпен кіру</span>
            {room.join_code ? (
              <>
                <span className="pl-[0.18em] text-[48px] font-bold tabular-nums tracking-[0.18em] lg:text-[72px]">{room.join_code}</span>
                <div className="rounded-[14px] border border-bl-line bg-white p-4">
                  <JoinQr url={joinUrl} size={220} />
                </div>
              </>
            ) : null}
            <span className="text-center text-base text-bl-ink2">Тек сіздің сыныбыңыздың оқушылары кіре алады</span>
          </section>

          <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
            <div className="rounded-[20px] border border-bl-line bg-white p-5 lg:p-6">
              <PlayerGrid players={seated} max={room.max_players} meId={view.me.user_id} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-[20px] border border-bl-line bg-white px-6 py-5 text-[15px]">
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-bl-ink2">Масштаб</span>
                <span className="font-semibold">{room.scope.labels.length} §</span>
              </span>
              {room.settings.size ? (
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-bl-ink2">Карта</span>
                  <span className="font-semibold">
                    {room.settings.size} × {room.settings.size}
                  </span>
                </span>
              ) : null}
              {room.settings.answer_s ? (
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-bl-ink2">Сұраққа уақыт</span>
                  <span className="font-semibold">{room.settings.answer_s} сек</span>
                </span>
              ) : null}
              {room.settings.stages ? (
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-bl-ink2">Кезең</span>
                  <span className="font-semibold">{room.settings.stages}</span>
                </span>
              ) : null}
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-bl-ink2">Сіз</span>
                <span className="font-semibold">көрсетесіз, ойнамайсыз</span>
              </span>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() =>
                void run(async () => {
                  if (roomId) live.setView(await api.start(roomId));
                })
              }
              className="h-[60px] rounded-2xl border-0 bg-bl-btn text-lg font-semibold text-white disabled:bg-bl-handle disabled:text-bl-ink3"
            >
              {ready ? 'Ойынды бастау' : `Кемінде ${room.min_players} ойыншы керек`}
            </button>
            <ActionError message={error} />
          </section>
        </main>
        {closeSheet}
      </div>
    );
  }

  if (room.status === 'finished') {
    const winner = results.find((r) => r.place === 1);
    return (
      <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
        {header(title)}
        <main className="mx-auto flex w-full max-w-[960px] flex-col items-center gap-6 px-4 py-8 lg:px-8 lg:py-10">
          {winner ? <h2 className="m-0 text-center text-[32px] font-bold tracking-[-0.02em] lg:text-[40px]">{winner.name} жеңді</h2> : null}
          {reason && FINISH_REASON[reason] ? <p className="m-0 text-base text-bl-ink3">{FINISH_REASON[reason]}</p> : null}
          <div className="w-full max-w-[600px]">{results.length ? <Podium rows={results} /> : null}</div>
          <p className="m-0 text-center text-base text-bl-ink2">Ойын нәтижесі емтихан бағасына әсер етпейді.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink to="/teacher/games" full={false}>
              Жаңа бөлме
            </ButtonLink>
            <ButtonLink to="/teacher" variant="secondary" full={false}>
              Панельге оралу
            </ButtonLink>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
      {header(title)}
      <main className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-6 p-4 lg:p-8">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 rounded-[20px] border border-bl-line bg-white p-4 lg:p-6">
          {view.public ? <GameView view={view} act={async () => undefined} busy /> : <LoadingBlock rows={3} />}
        </section>
        {standings.length ? (
          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 self-start rounded-[20px] border border-bl-line bg-white p-6">
            <h2 className="m-0 mb-1 text-xl font-bold">Ұпай</h2>
            {standings.map((r, i) => (
              <div key={r.seat} className="flex min-h-[52px] items-center gap-3 border-b border-bl-soft last:border-0">
                <span className="w-6 text-lg font-bold">{i + 1}</span>
                <span aria-hidden="true" className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: SEAT_COLORS[r.seat % SEAT_COLORS.length] }} />
                <span className="flex-1 truncate text-lg font-semibold">{r.name}</span>
                <span className="text-xl font-bold tabular-nums">{r.score}</span>
              </div>
            ))}
          </section>
        ) : null}
        {error ? (
          <div className="w-full">
            <Banner tone="bad">{error}</Banner>
          </div>
        ) : null}
      </main>
      {closeSheet}
    </div>
  );
}
