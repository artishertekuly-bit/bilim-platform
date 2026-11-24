// Әдіс жорығы (geimifikatsiya §4.1, D43, D49): карта, аймақтар (§), кезек, карталар.
import { useState } from 'react';

import { Countdown, LastAnswer, QuestionPanel, StatusBanner, type QuestionView } from '@/components/games/GameUi';
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

// Аймақ (§) түстері (дизайн: AdisBoard.dc.html REG): бос ұяшықтың төменгі жиегі мен шартты белгі.
const REGION_COLORS = ['#8CC5BE', '#E7C27D', '#E4A0B4', '#B7A6E6', '#9FC1EA', '#BCD08F', '#E8B38C', '#A9C9D9'];
const CARD_LABEL: Record<string, string> = { fifty: '50/50', double: '×2 ұпай', second: 'Екінші мүмкіндік', shield: 'Қалқан' };

export default function ConquestView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as ConquestPublic;
  const priv = view.private as ConquestPrivate;
  const [shieldMode, setShieldMode] = useState(false);
  const mySeat = view.me.seat;
  const myTurn = mySeat !== null && pub.turn_seat === mySeat && pub.phase !== 'finished';
  const turnPlayer = pub.players.find((p) => p.seat === pub.turn_seat);
  const allowed = new Set(priv.allowed ?? []);
  const cards = priv.my_cards ?? [];
  const finished = pub.phase === 'finished';
  const free = pub.cells.filter((c) => c.owner === null).length;
  const seatColor = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];
  const nameOf = (seat: number | null) => pub.players.find((p) => p.seat === seat)?.name ?? '';
  const regionOf = (index: number) => pub.labels[pub.cells[index]?.region] ?? '';

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

  let title = myTurn ? 'Сіздің кезегіңіз' : `${turnPlayer?.name ?? ''} жүреді`;
  let hint = myTurn
    ? shieldMode
      ? 'Қорғайтын өз ұяшығыңызды таңдаңыз.'
      : 'Қара жиекті ұяшықты таңдап, сұраққа жауап беріңіз.'
    : 'Ол ұяшық таңдап, сұраққа жауап береді.';
  if (pub.phase === 'question') {
    title = myTurn ? 'Сұраққа жауап беріңіз' : `${turnPlayer?.name ?? ''} жауап беріп жатыр`;
    hint = pub.cell !== null ? `${regionOf(pub.cell)} · құны ${pub.cells[pub.cell]?.value ?? 1}` : '';
  }
  if (finished) {
    title = 'Жорық аяқталды';
    hint = 'Нәтиже төменде.';
  }

  const tagColor = pub.cell !== null ? REGION_COLORS[(pub.cells[pub.cell]?.region ?? 0) % REGION_COLORS.length] : undefined;
  const fiftyIndex = cards.indexOf('fifty');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-bl-line bg-white px-3 py-1.5 text-[13px] font-semibold tabular-nums">Бос ұяшық: {free}</span>
        <span className="rounded-full border border-bl-line bg-white px-3 py-1.5 text-[13px] font-semibold">{pub.round}-айналым</span>
        <span className="ml-auto">
          <Countdown deadline={pub.ends_at} label="Ойын" />
        </span>
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(pub.players.length, 2), 4)}, minmax(0, 1fr))` }}>
        {pub.players.map((p) => (
          <div
            key={p.seat}
            className={cn('flex min-w-0 flex-col gap-0.5 rounded-xl bg-white px-[9px] py-2', p.left && 'opacity-50')}
            style={{ border: p.seat === pub.turn_seat && !finished ? `2px solid ${seatColor(p.seat)}` : '1px solid #E2E0DB' }}
          >
            <span className="flex min-w-0 items-center gap-[5px]">
              <i aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: seatColor(p.seat) }} />
              <span className="truncate text-xs font-semibold">{p.seat === mySeat ? 'Сіз' : p.name}</span>
            </span>
            <span className="text-lg font-bold tabular-nums" aria-label={`${p.score} ұпай, ${p.cells} ұяшық`}>
              {p.score}
            </span>
          </div>
        ))}
      </div>

      <StatusBanner title={title} hint={hint || undefined} accent={seatColor(pub.turn_seat)} />
      {pub.phase === 'pick' ? (
        <div className="flex justify-end">
          <Countdown deadline={pub.deadline} label="Таңдау" />
        </div>
      ) : null}

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${pub.size}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Жорық картасы"
      >
        {pub.cells.map((cell, index) => {
          const owner = cell.owner;
          const color = owner !== null ? seatColor(owner) : null;
          const region = REGION_COLORS[cell.region % REGION_COLORS.length];
          const selectable = myTurn && pub.phase === 'pick' && (shieldMode ? owner === mySeat : allowed.has(index));
          const picking = myTurn && pub.phase === 'pick';
          const label = pub.labels[cell.region] ?? '';
          return (
            <button
              key={index}
              type="button"
              onClick={() => onCell(index)}
              disabled={!selectable || busy}
              aria-label={`${label}, құны ${cell.value}${cell.diamond ? ', алмаз' : ''}${cell.shield ? ', қалқан' : ''}${
                owner !== null ? `, ${owner === mySeat ? 'сіздікі' : nameOf(owner)}` : ', бос'
              }${selectable ? ', таңдауға болады' : ''}`}
              className="relative flex aspect-square items-center justify-center rounded-[10px] border-0 p-0 disabled:cursor-default"
              style={{
                background: color ?? '#FFFFFF',
                color: color ? '#FFFFFF' : '#4A4A4A',
                boxShadow: color ? 'inset 0 -5px 0 rgba(0,0,0,0.22)' : `inset 0 0 0 1px #E2E0DB, inset 0 -5px 0 ${region}`,
                outline: selectable ? '3px solid #111111' : pub.cell === index ? '3px solid #B7791F' : undefined,
                outlineOffset: -3,
                opacity: picking && !selectable && pub.cell !== index ? 0.45 : 1,
              }}
            >
              <span aria-hidden="true" className="absolute left-[5px] top-[3px] text-[9px] leading-none tracking-[1px]">
                {'•'.repeat(cell.value)}
              </span>
              {cell.diamond ? (
                <span aria-hidden="true" className="absolute right-[5px] top-[3px] text-[11px] leading-none text-[#B7791F]">
                  ◆
                </span>
              ) : null}
              {cell.shield ? (
                <span aria-hidden="true" className="absolute bottom-[7px] left-[5px] text-[10px] leading-none">
                  ⛨
                </span>
              ) : null}
              <span aria-hidden="true" className={color ? 'text-lg font-bold' : 'text-xs font-semibold text-[#8A857C]'}>
                {owner !== null ? (owner === mySeat ? 'С' : nameOf(owner).charAt(0)) : (label.match(/§\s?(\d+)/)?.[1] ?? '')}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {pub.labels.map((label, i) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-bl-ink3">
            <i aria-hidden="true" className="h-3 w-3 flex-none rounded-[3px]" style={{ background: REGION_COLORS[i % REGION_COLORS.length] }} />
            {label}
          </span>
        ))}
      </div>

      {mySeat !== null && cards.length ? (
        <section className="flex flex-wrap items-center gap-2 rounded-[14px] border border-bl-line bg-white px-3.5 py-3">
          <span className="text-[13px] font-semibold text-bl-ink2">Карталарым:</span>
          {cards.map((card, i) => {
            const usable = myTurn && !busy && (card === 'shield' ? pub.phase === 'pick' : pub.phase === 'question');
            return (
              <button
                key={`${card}-${i}`}
                type="button"
                disabled={!usable}
                aria-pressed={card === 'shield' ? shieldMode : undefined}
                onClick={() => (card === 'shield' ? setShieldMode((v) => !v) : void act({ type: 'card', card: card as 'fifty' }))}
                className={cn(
                  'h-9 rounded-full border px-3 text-[13px] font-semibold',
                  card === 'shield' && shieldMode
                    ? 'border-bl-ink bg-bl-ink text-white'
                    : usable
                      ? 'border-bl-ink bg-white text-bl-ink'
                      : 'border-bl-line bg-white text-[#8A857C]',
                )}
              >
                {CARD_LABEL[card] ?? card}
              </button>
            );
          })}
        </section>
      ) : null}

      {pub.phase === 'question' && pub.question ? (
        <QuestionPanel
          question={pub.question}
          canAnswer={myTurn}
          busy={busy}
          sheet
          tag={pub.cell !== null ? regionOf(pub.cell) : undefined}
          tagStyle={tagColor ? { background: tagColor, color: '#111111' } : undefined}
          onAnswer={(option) => void act({ type: 'answer', option })}
          extra={
            myTurn && fiftyIndex >= 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ type: 'card', card: 'fifty' })}
                className="h-[52px] flex-none rounded-[14px] border border-bl-field bg-white px-4 text-[15px] font-semibold text-bl-ink"
              >
                50/50 · {cards.filter((c) => c === 'fifty').length}
              </button>
            ) : undefined
          }
          note={
            myTurn
              ? priv.double
                ? '×2 картасы қосулы.'
                : priv.second
                  ? 'Екінші мүмкіндік қосулы.'
                  : `Құны: ${pub.cell !== null ? pub.cells[pub.cell]?.value ?? 1 : 1}`
              : `${turnPlayer?.name ?? ''} жауап беріп жатыр.`
          }
        />
      ) : null}
      {pub.last?.second_chance && myTurn ? (
        <p role="status" className="m-0 rounded-[14px] bg-bl-badbg px-3.5 py-3 text-[15px] font-semibold text-bl-badtext">
          Қате, бірақ тағы бір мүмкіндік бар.
        </p>
      ) : null}
      {pub.last && !pub.last.second_chance ? <LastAnswer last={pub.last} /> : null}
      {pub.last?.card_awarded ? <p className="m-0 text-sm font-semibold text-bl-oktext">Жаңа сыйлық карта берілді.</p> : null}
    </div>
  );
}