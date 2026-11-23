// Теңіз шайқасы (geimifikatsiya §4.3, D50). Өз кемелерің тек жеке арнадан келеді, қарсыластыкі ешқашан келмейді.
import { useMemo, useState } from 'react';

import { Card, Chip, PrimaryButton } from '@/components/exam/ExamUi';
import { Countdown, LastAnswer, QuestionPanel, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { cn } from '@/lib/utils';

interface Player {
  id: string; seat: number; name: string; bot: boolean; left: boolean; placed: boolean;
  board: Record<string, 'hit' | 'miss'>; sunk: number[][]; ships_left: number;
}
interface BattlePublic {
  size: number;
  fleet: number[];
  players: Player[];
  turn_seat: number | null;
  phase: 'placement' | 'question' | 'shoot' | 'bot' | 'finished';
  deadline: string | null;
  question: QuestionView | null;
  last: { seat?: number; cell?: number; result?: 'hit' | 'miss' | 'sunk'; ok?: boolean; right_option?: string; timeout?: boolean } | null;
}
interface BattlePrivate { my_ships?: number[][] }

const SIZE = 6;

function around(cell: number): number[] {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const out: number[] = [];
  for (let rr = r - 1; rr <= r + 1; rr += 1)
    for (let cc = c - 1; cc <= c + 1; cc += 1) if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
  return out;
}

function Grid({ cells, onCell, label }: { cells: (i: number) => { className: string; mark: string; enabled: boolean }; onCell?: (i: number) => void; label: string }) {
  return (
    <div className="grid grid-cols-6 gap-1 rounded-xl border border-[#E2E0DB] bg-[#EAF2F8] p-1.5" role="grid" aria-label={label}>
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const cell = cells(i);
        return (
          <button key={i} type="button" disabled={!cell.enabled} onClick={() => onCell?.(i)}
            aria-label={`${label}: ${String.fromCharCode(65 + (i % SIZE))}${Math.floor(i / SIZE) + 1}`}
            className={cn('flex aspect-square items-center justify-center rounded text-sm font-bold', cell.className)}>
            {cell.mark}
          </button>
        );
      })}
    </div>
  );
}

function Placement({ fleet, act, busy }: { fleet: number[]; act: GameViewProps['act']; busy: boolean }) {
  const [ships, setShips] = useState<number[][]>([]);
  const [vertical, setVertical] = useState(false);
  const remaining = useMemo(() => {
    const left = [...fleet];
    for (const ship of ships) left.splice(left.indexOf(ship.length), 1);
    return left;
  }, [fleet, ships]);
  const occupied = new Set(ships.flat());
  const blocked = new Set(ships.flat().flatMap(around));
  const length = remaining[0];

  const place = (cell: number) => {
    if (!length) return;
    const r = Math.floor(cell / SIZE);
    const c = cell % SIZE;
    const cells = Array.from({ length }, (_, k) => (vertical ? (r + k) * SIZE + c : r * SIZE + c + k));
    const inside = vertical ? r + length <= SIZE : c + length <= SIZE;
    if (!inside || cells.some((x) => blocked.has(x))) return;
    setShips([...ships, cells]);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-[#4A4A4A]">
        Кемелерді орналастыр: {length ? `қазір ${length} ұяшықты кеме` : 'бәрі қойылды'}. Кемелер бір-біріне тимейді.
      </p>
      <Grid label="Менің алаңым" onCell={place}
        cells={(i) => ({ enabled: Boolean(length) && !busy, mark: occupied.has(i) ? '■' : '',
          className: occupied.has(i) ? 'bg-[#475569] text-white' : blocked.has(i) ? 'bg-[#DCE6EE]' : 'bg-white' })} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-[#D9D6D0] bg-white px-3 py-1.5 text-sm font-semibold"
          onClick={() => setVertical((v) => !v)}>{vertical ? 'Тігінен' : 'Көлденең'}</button>
        <button type="button" className="rounded-full border border-[#D9D6D0] bg-white px-3 py-1.5 text-sm font-semibold"
          onClick={() => setShips([])}>Тазалау</button>
        <button type="button" disabled={busy} className="rounded-full border border-[#111111] bg-white px-3 py-1.5 text-sm font-semibold"
          onClick={() => void act({ type: 'auto_place' })}>Автоматты</button>
      </div>
      <PrimaryButton disabled={remaining.length > 0 || busy} onClick={() => void act({ type: 'place', ships })}>
        Растау
      </PrimaryButton>
    </div>
  );
}

export default function BattleshipView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as BattlePublic;
  const priv = view.private as BattlePrivate;
  const mySeat = view.me.seat;
  const me = pub.players.find((p) => p.seat === mySeat);
  const enemy = pub.players.find((p) => p.seat !== mySeat) ?? pub.players[1];
  const myTurn = mySeat !== null && pub.turn_seat === mySeat;
  const myShips = new Set((priv.my_ships ?? []).flat());
  const turnPlayer = pub.players.find((p) => p.seat === pub.turn_seat);

  if (pub.phase === 'placement') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><Countdown deadline={pub.deadline} label="Орналастыру" /></div>
        {me && !me.placed ? <Placement fleet={pub.fleet} act={act} busy={busy} /> : (
          <Card className="p-4 text-sm">Кемелерің дайын. Қарсылас орналастырып жатыр…</Card>
        )}
      </div>
    );
  }

  const shotCell = (player: Player | undefined, i: number, showShips: boolean) => {
    const shot = player?.board[String(i)];
    const sunk = player?.sunk.some((s) => s.includes(i));
    if (sunk) return { mark: '✕', className: 'bg-[#7F1D1D] text-white' };
    if (shot === 'hit') return { mark: '✕', className: 'bg-[#DC2626] text-white' };
    if (shot === 'miss') return { mark: '·', className: 'bg-[#DCE6EE] text-[#475569]' };
    if (showShips && myShips.has(i)) return { mark: '', className: 'bg-[#475569]' };
    return { mark: '', className: 'bg-white' };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip tone={myTurn ? 'good' : 'neutral'}>{myTurn ? 'Сенің кезегің' : `${turnPlayer?.name ?? ''} жүреді`}</Chip>
        <Countdown deadline={pub.deadline} />
        <span className="ml-auto text-xs text-[#5E5E5E]">Қарсыласта {enemy?.ships_left ?? 0} кеме қалды</span>
      </div>
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">{enemy?.name ?? 'Қарсылас'} алаңы</p>
      <Grid label="Қарсылас алаңы"
        onCell={(i) => void act({ type: 'shoot', cell: i })}
        cells={(i) => {
          const base = shotCell(enemy, i, false);
          const free = !enemy?.board[String(i)];
          const enabled = myTurn && pub.phase === 'shoot' && free && !busy;
          return { ...base, enabled, className: cn(base.className, enabled && 'ring-1 ring-[#111111] hover:bg-[#FEF3C7]') };
        }} />
      {pub.phase === 'question' && pub.question ? (
        <QuestionPanel question={pub.question} canAnswer={myTurn} busy={busy}
          onAnswer={(option) => void act({ type: 'answer', option })}
          note={myTurn ? 'Дұрыс жауап берсең, атасың.' : `${turnPlayer?.name ?? ''} сұраққа жауап беріп жатыр.`} />
      ) : null}
      {pub.phase === 'shoot' && myTurn ? <Card className="p-3 text-sm">Қарсылас алаңынан ұяшық таңдап, ат.</Card> : null}
      {pub.phase === 'bot' ? <Card className="p-3 text-sm">Демо-бот ойланып жатыр…</Card> : null}
      {pub.last?.result ? (
        <p className="m-0 text-sm font-semibold">
          {pub.last.result === 'miss' ? 'Мүлт кетті.' : pub.last.result === 'sunk' ? 'Кеме батты!' : 'Тиді!'}
        </p>
      ) : <LastAnswer last={pub.last} />}
      {mySeat !== null ? (
        <>
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">Менің алаңым</p>
          <Grid label="Менің алаңым" cells={(i) => ({ ...shotCell(me, i, true), enabled: false })} />
        </>
      ) : null}
    </div>
  );
}
