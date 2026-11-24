// Шашки — орыс дойбысы (geimifikatsiya §4.2, D44). Жүрістердің тізімін сервер береді: клиент тек таңдайды.
import { useMemo, useState } from 'react';

import { Countdown, LastAnswer, QuestionPanel, StatusBanner, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { cn } from '@/lib/utils';

interface Player { id: string; seat: number; name: string; bot: boolean; left: boolean; color: 'w' | 'b' }
interface CheckersPublic {
  board: string[];
  players: Player[];
  turn_seat: number;
  phase: 'question' | 'move' | 'bot' | 'finished';
  deadline: string | null;
  question: QuestionView | null;
  last: { seat?: number; path?: number[]; captured?: number[]; ok?: boolean; right_option?: string; timeout?: boolean } | null;
  quiet_moves: number;
  draw_moves: number;
  winner_seat: number | null;
  finish_reason: string | null;
}
interface CheckersPrivate { color?: 'w' | 'b'; moves?: number[][] }

export default function CheckersView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as CheckersPublic;
  const priv = view.private as CheckersPrivate;
  const [selected, setSelected] = useState<number | null>(null);
  const mySeat = view.me.seat;
  const myTurn = mySeat !== null && pub.turn_seat === mySeat;
  const flipped = priv.color === 'b';
  const turnPlayer = pub.players.find((p) => p.seat === pub.turn_seat);
  const moves = useMemo(() => priv.moves ?? [], [priv.moves]);
  const starts = new Set(moves.map((m) => m[0]));
  const targets = new Map(moves.filter((m) => m[0] === selected).map((m) => [m[m.length - 1], m]));
  const lastSquares = new Set(pub.last?.path ?? []);

  const onSquare = (square: number) => {
    if (!myTurn || pub.phase !== 'move' || busy) return;
    const move = targets.get(square);
    if (move) {
      setSelected(null);
      void act({ type: 'move', path: move });
      return;
    }
    setSelected(starts.has(square) ? square : null);
  };

  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));
  const me = pub.players.find((p) => p.seat === mySeat);
  const opponent = pub.players.find((p) => p.seat !== mySeat);
  const countOf = (color?: 'w' | 'b') => (color ? pub.board.filter((c) => c && c.toLowerCase() === color).length : 0);
  const finished = pub.phase === 'finished';

  let title = myTurn ? 'Сіздің жүрісіңіз' : `${turnPlayer?.name ?? 'Қарсылас'} жүреді`;
  let hint = myTurn ? 'Жүру үшін алдымен сұраққа жауап беріңіз. Тас алу міндетті.' : 'Ол сұраққа жауап беріп жатыр.';
  if (pub.phase === 'move') {
    title = myTurn ? 'Енді жүріңіз' : `${turnPlayer?.name ?? 'Қарсылас'} жүріс таңдап жатыр`;
    hint = myTurn ? (selected === null ? 'Көк жиекті тасты таңдаңыз.' : 'Ақ нүктелі ұяшыққа жүріңіз.') : 'Күте тұрыңыз.';
  }
  if (pub.phase === 'bot') {
    title = 'Демо-бот ойланып жатыр…';
    hint = '';
  }
  if (finished) {
    title = 'Ойын аяқталды';
    hint = pub.winner_seat === mySeat ? 'Сіз жеңдіңіз!' : pub.winner_seat === null ? 'Тең ойын.' : `${opponent?.name ?? 'Қарсылас'} жеңді.`;
  }

  const box = (p: Player | undefined, label: string) => (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl bg-white px-3 py-2.5',
        p && p.seat === pub.turn_seat && !finished ? 'border-2 border-bl-ink' : 'border border-bl-line',
      )}
    >
      <i
        aria-hidden="true"
        className={cn(
          'box-border h-[18px] w-[18px] flex-none rounded-full',
          p?.color === 'b' ? 'bg-bl-ink' : 'border-2 border-bl-ink bg-white',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
      <span className="text-lg font-bold tabular-nums" aria-label={`${countOf(p?.color)} тас`}>
        {countOf(p?.color)}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {box(me, 'Сіз')}
        {box(opponent, opponent?.name ?? 'Қарсылас')}
      </div>

      <StatusBanner title={title} hint={hint || undefined} />

      <div className="flex items-center justify-between text-xs text-bl-ink2">
        <Countdown deadline={pub.phase === 'question' ? null : pub.deadline} />
        <span className="ml-auto">Тассыз жүріс: {pub.quiet_moves}/{pub.draw_moves}</span>
      </div>

      <div className="grid grid-cols-8 overflow-hidden rounded-[10px] border-2 border-bl-ink3" role="grid" aria-label="Шашки тақтасы">
        {order.map((square) => {
          const r = Math.floor(square / 8);
          const c = square % 8;
          const dark = (r + c) % 2 === 1;
          const piece = pub.board[square];
          const isTarget = targets.has(square);
          const isStart = myTurn && pub.phase === 'move' && starts.has(square);
          const black = piece ? piece.toLowerCase() === 'b' : false;
          const king = piece ? piece === piece.toUpperCase() : false;
          const mine = piece ? piece.toLowerCase() === priv.color : false;
          return (
            <button
              key={square}
              type="button"
              onClick={() => onSquare(square)}
              disabled={!dark || !(isTarget || isStart)}
              aria-label={`${String.fromCharCode(97 + c)}${8 - r}${
                piece ? `, ${mine ? 'сіздің тасыңыз' : 'қарсылас тасы'}${king ? ', дамка' : ''}` : dark ? ', бос' : ''
              }${isTarget ? ', осында жүруге болады' : ''}${isStart ? ', жүре алады' : ''}`}
              className="relative flex aspect-square items-center justify-center border-0 p-0 disabled:cursor-default"
              style={{
                background: dark ? (lastSquares.has(square) ? '#8F8475' : '#A59B8B') : '#F1EFEA',
                boxShadow: selected === square ? 'inset 0 0 0 4px #2563EB' : isStart ? 'inset 0 0 0 2px #2563EB' : undefined,
              }}
            >
              {piece ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'box-border flex h-[76%] w-[76%] items-center justify-center rounded-full text-sm font-bold',
                    black
                      ? 'bg-bl-ink text-white shadow-[inset_0_-3px_0_rgba(255,255,255,0.18)]'
                      : 'border-2 border-bl-ink bg-white text-bl-ink shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]',
                  )}
                >
                  {king ? 'Д' : ''}
                </span>
              ) : null}
              {isTarget ? (
                <span aria-hidden="true" className="absolute h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_3px_#2563EB]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {pub.phase === 'question' && pub.question ? (
        <QuestionPanel
          question={pub.question}
          canAnswer={myTurn}
          busy={busy}
          sheet
          tag="Сұрақ · жүріс"
          onAnswer={(option) => void act({ type: 'answer', option })}
          note={myTurn ? 'Дұрыс жауап берсеңіз, жүріс жасайсыз.' : `${turnPlayer?.name ?? ''} сұраққа жауап беріп жатыр.`}
        />
      ) : null}
      <LastAnswer last={pub.last} />
    </div>
  );
}