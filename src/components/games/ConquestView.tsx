// Әдіс жорығы (geimifikatsiya §4.1, D43, D49): карта, аймақтар (§), кезек, карталар.
import { useState } from 'react';

import { Card, Chip } from '@/components/exam/ExamUi';
import { Countdown, LastAnswer, QuestionPanel, SeatDot, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { SEAT_COLORS } from '@/lib/games-api';
import { cn } from '@/lib/utils';

interface Cell { owner: number | null; value: number; diamond: boolean; region: number; shield: boolean }
interface Player { id: string; seat: number; name: string; left: boolean; score: number; cells: number; card_count: number }
interface ConquestPublic {
  size: number;
  labels: string[];
  cells: Cell[];
  players: Player[];
  turn_seat: number;
  phase: 'pick' | 'question' | 'finished';
  deadline: string | null;
  ends_at: string;
  round: number;
  cell: number | null;
  question: QuestionView | null;
  last: { seat?: number; ok?: boolean; right_option?: string; skipped?: boolean; second_chance?: boolean; card_awarded?: boolean } | null;
}
interface ConquestPrivate { my_cards?: string[]; double?: boolean; second?: boolean; allowed?: number[] }

const REGION_TINTS = ['#F3EFE6', '#E8F0F7', '#EEF5EA', '#F7ECEC', '#F1ECF7', '#EAF4F4', '#F6F2E3', '#ECEFF1'];
const CARD_LABEL: Record<string, string> = { fifty: '50/50', double: '×2 ұпай', second: 'Екінші мүмкіндік', shield: 'Қалқан' };

function tint(hex: string): string {
  return `${hex}33`;
}

export default function ConquestView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as ConquestPublic;
  const priv = view.private as ConquestPrivate;
  const [shieldMode, setShieldMode] = useState(false);
  const mySeat = view.me.seat;
  const myTurn = mySeat !== null && pub.turn_seat === mySeat && pub.phase !== 'finished';
  const turnPlayer = pub.players.find((p) => p.seat === pub.turn_seat);
  const allowed = new Set(priv.allowed ?? []);
  const cards = priv.my_cards ?? [];

  const onCell = (index: number) => {
    if (!myTurn || busy || pub.phase !== 'pick') return;
    if (shieldMode) {
      if (pub.cells[index].owner === mySeat) {
        setShieldMode(false);
        void act({ type: 'card', card: 'shield', cell: index });
      }
      return;
    }
    if (allowed.has(index)) void act({ type: 'pick', cell: index });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip>{pub.round}-айналым</Chip>
        <span className="flex items-center gap-1.5 font-semibold">
          <SeatDot seat={pub.turn_seat} /> {myTurn ? 'Сенің кезегің' : `${turnPlayer?.name ?? ''} жүреді`}
        </span>
        {pub.phase === 'pick' ? <Countdown deadline={pub.deadline} label="Таңдау" /> : null}
        <span className="ml-auto"><Countdown deadline={pub.ends_at} label="Ойын" /></span>
      </div>

      <div className="flex flex-wrap gap-2">
        {pub.players.map((p) => (
          <span key={p.seat} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
            p.seat === pub.turn_seat ? 'border-[#111111] bg-white' : 'border-[#E2E0DB] bg-white', p.left && 'opacity-50')}>
            <SeatDot seat={p.seat} /> <b>{p.name}</b> {p.score} ұп · {p.cells} ұяш
          </span>
        ))}
      </div>

      <div
        className="grid gap-1 rounded-2xl border border-[#E2E0DB] bg-white p-2"
        style={{ gridTemplateColumns: `repeat(${pub.size}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Әдіс жорығының картасы"
      >
        {pub.cells.map((cell, index) => {
          const color = cell.owner !== null ? SEAT_COLORS[cell.owner % SEAT_COLORS.length] : null;
          const selectable = myTurn && pub.phase === 'pick' && (shieldMode ? cell.owner === mySeat : allowed.has(index));
          return (
            <button
              key={index}
              type="button"
              onClick={() => onCell(index)}
              disabled={!selectable || busy}
              aria-label={`Ұяшық ${index + 1}, құны ${cell.value}${cell.diamond ? ', алмаз' : ''}`}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-md text-xs font-bold transition-transform',
                selectable && 'ring-2 ring-[#111111] ring-offset-1 hover:scale-[1.04]',
                pub.cell === index && 'ring-2 ring-[#D97706] ring-offset-1',
              )}
              style={{
                background: color ? tint(color) : REGION_TINTS[cell.region % REGION_TINTS.length],
                border: color ? `2px solid ${color}` : '1px solid #E2E0DB',
              }}
            >
              <span className="text-[#111111]">{'•'.repeat(cell.value)}</span>
              {cell.diamond ? <span className="absolute right-0.5 top-0 text-[10px] text-[#0891B2]">◆</span> : null}
              {cell.shield ? <span className="absolute bottom-0 left-0.5 text-[10px]">⛨</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px] text-[#5E5E5E]">
        {pub.labels.map((label, i) => (
          <span key={label} className="flex items-center gap-1 rounded px-1.5 py-0.5"
            style={{ background: REGION_TINTS[i % REGION_TINTS.length] }}>{label}</span>
        ))}
      </div>

      {mySeat !== null && cards.length ? (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs font-semibold text-[#5E5E5E]">Карталарым:</span>
          {cards.map((card, i) => {
            const usable = myTurn && !busy && (card === 'shield' ? pub.phase === 'pick' : pub.phase === 'question');
            return (
              <button key={`${card}-${i}`} type="button" disabled={!usable}
                onClick={() => (card === 'shield' ? setShieldMode((v) => !v) : void act({ type: 'card', card: card as 'fifty' }))}
                className={cn('rounded-full border px-3 py-1 text-xs font-semibold',
                  usable ? 'border-[#111111] bg-white' : 'border-[#E2E0DB] text-[#9A9A9A]',
                  card === 'shield' && shieldMode && 'bg-[#111111] text-white')}>
                {CARD_LABEL[card] ?? card}
              </button>
            );
          })}
          {shieldMode ? <span className="text-xs text-[#5E5E5E]">Қорғайтын өз ұяшығыңды таңда.</span> : null}
        </Card>
      ) : null}

      {pub.phase === 'question' && pub.question ? (
        <QuestionPanel
          question={pub.question}
          canAnswer={myTurn}
          busy={busy}
          onAnswer={(option) => void act({ type: 'answer', option })}
          note={myTurn ? (priv.double ? '×2 картасы қосулы.' : priv.second ? 'Екінші мүмкіндік қосулы.' : null)
            : `${turnPlayer?.name ?? ''} жауап беріп жатыр.`}
        />
      ) : null}
      {pub.last?.second_chance && myTurn ? <p className="m-0 text-sm font-semibold text-[#B42323]">Қате, бірақ тағы бір мүмкіндік бар.</p> : null}
      {pub.last && !pub.last.second_chance ? <LastAnswer last={pub.last} /> : null}
      {pub.last?.card_awarded ? <p className="m-0 text-sm text-[#1F6B3F]">Жаңа сыйлық карта берілді.</p> : null}
    </div>
  );
}
