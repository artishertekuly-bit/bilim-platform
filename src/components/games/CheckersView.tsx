// Шашки — орыс дойбысы (geimifikatsiya §4.2, D44). Жүрістердің тізімін сервер береді: клиент тек таңдайды.
import { useMemo, useState } from 'react';

import { Card, Chip } from '@/components/exam/ExamUi';
import { Countdown, LastAnswer, QuestionPanel, type QuestionView } from '@/components/games/GameUi';
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {pub.players.map((p) => (
          <Chip key={p.seat} tone={p.seat === pub.turn_seat ? 'good' : 'neutral'}>
            {p.color === 'w' ? '○' : '●'} {p.name}
          </Chip>
        ))}
        <Countdown deadline={pub.deadline} />
        <span className="ml-auto text-xs text-[#5E5E5E]">Тассыз жүріс: {pub.quiet_moves}/{pub.draw_moves}</span>
      </div>

      <div className="grid grid-cols-8 overflow-hidden rounded-xl border border-[#2B2B2B]" role="grid" aria-label="Шашки тақтасы">
        {order.map((square) => {
          const r = Math.floor(square / 8);
          const c = square % 8;
          const dark = (r + c) % 2 === 1;
          const piece = pub.board[square];
          const isTarget = targets.has(square);
          const isStart = myTurn && pub.phase === 'move' && starts.has(square);
          return (
            <button
              key={square}
              type="button"
              onClick={() => onSquare(square)}
              disabled={!dark}
              aria-label={`${String.fromCharCode(97 + c)}${8 - r}${piece ? `, ${piece.toLowerCase() === 'w' ? 'ақ' : 'қара'}${piece === piece.toUpperCase() ? ' дамка' : ''}` : ''}`}
              className={cn(
                'relative flex aspect-square items-center justify-center',
                dark ? 'bg-[#8B6B4A]' : 'bg-[#EAD9C0]',
                lastSquares.has(square) && dark && 'bg-[#A88A5E]',
                selected === square && 'ring-2 ring-inset ring-[#FACC15]',
                isStart && selected !== square && 'ring-1 ring-inset ring-[#FDE68A]',
              )}
            >
              {piece ? (
                <span
                  className={cn(
                    'flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 text-[11px] font-bold shadow',
                    piece.toLowerCase() === 'w' ? 'border-[#D6D3CD] bg-[#FAFAF9] text-[#111111]' : 'border-[#0B0B0B] bg-[#262626] text-white',
                  )}
                >
                  {piece === piece.toUpperCase() ? '♛' : ''}
                </span>
              ) : null}
              {isTarget ? <span className="absolute h-3 w-3 rounded-full bg-[#FACC15]" /> : null}
            </button>
          );
        })}
      </div>

      {pub.phase === 'question' && pub.question ? (
        <QuestionPanel
          question={pub.question}
          canAnswer={myTurn}
          busy={busy}
          onAnswer={(option) => void act({ type: 'answer', option })}
          note={myTurn ? 'Дұрыс жауап берсең, жүріс жасайсың.' : `${turnPlayer?.name ?? ''} сұраққа жауап беріп жатыр.`}
        />
      ) : null}
      {pub.phase === 'move' ? (
        <Card className="p-3 text-sm">
          {myTurn ? 'Тасты таңда, сосын сары нүктеге жүр. Тас алу міндетті.' : `${turnPlayer?.name ?? ''} жүріс таңдап жатыр.`}
        </Card>
      ) : null}
      {pub.phase === 'bot' ? <Card className="p-3 text-sm">Демо-бот ойланып жатыр…</Card> : null}
      <LastAnswer last={pub.last} />
    </div>
  );
}
