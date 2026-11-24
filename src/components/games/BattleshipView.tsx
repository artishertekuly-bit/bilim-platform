// Теңіз шайқасы (geimifikatsiya §4.3, D50). Өз кемелерің тек жеке арнадан келеді, қарсыластыкі ешқашан келмейді.
import { useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@/components/bl/ui';
import { Countdown, LastAnswer, QuestionPanel, StatusBanner, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';

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

function Grid({ cells, onCell, label }: { cells: (i: number) => { style: CSSProperties; mark: string; enabled: boolean; aria?: string }; onCell?: (i: number) => void; label: string }) {
  return (
    <div className="grid grid-cols-6 gap-1" role="grid" aria-label={label}>
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const cell = cells(i);
        return (
          <button key={i} type="button" disabled={!cell.enabled} onClick={() => onCell?.(i)}
            aria-label={`${label}: ${String.fromCharCode(65 + (i % SIZE))}${Math.floor(i / SIZE) + 1}${cell.aria ? `, ${cell.aria}` : ''}`}
            className="flex aspect-square items-center justify-center rounded-lg border-0 p-0 text-xl font-bold disabled:cursor-default"
            style={cell.style}>
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
      <p className="m-0 text-sm text-bl-ink3">
        {length ? `Қазір ${length} ұяшықты кемені қойыңыз.` : 'Барлық кеме қойылды.'} Кемелер бір-біріне тимейді.
      </p>
      <Grid label="Менің алаңым" onCell={place}
        cells={(i) => ({ enabled: Boolean(length) && !busy, mark: '', aria: occupied.has(i) ? 'кеме' : undefined,
          style: { background: occupied.has(i) ? '#4A4A4A' : blocked.has(i) ? '#EEF2F7' : '#DDE7F5' } })} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" full={false} aria-pressed={vertical} onClick={() => setVertical((v) => !v)}>
          {vertical ? 'Тігінен' : 'Көлденең'}
        </Button>
        <Button variant="secondary" size="sm" full={false} onClick={() => setShips([])}>
          Тазалау
        </Button>
        <Button variant="secondary" size="sm" full={false} disabled={busy} onClick={() => void act({ type: 'auto_place' })}>
          Автоматты
        </Button>
      </div>
      <Button disabled={remaining.length > 0 || busy} onClick={() => void act({ type: 'place', ships })}>
        Растау
      </Button>
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
  const fleetSize = pub.fleet.length;

  if (pub.phase === 'placement') {
    return (
      <div className="flex flex-col gap-3">
        <StatusBanner title="Кемелерді орналастырыңыз" hint={<Countdown deadline={pub.deadline} label="Қалған уақыт" />} />
        {me && !me.placed ? (
          <Placement fleet={pub.fleet} act={act} busy={busy} />
        ) : (
          <p className="m-0 rounded-[14px] border border-bl-line bg-white px-3.5 py-3 text-sm">Кемелеріңіз дайын. Қарсылас орналастырып жатыр…</p>
        )}
      </div>
    );
  }

  const aiming = myTurn && pub.phase === 'shoot';
  const finished = pub.phase === 'finished';
  let title = myTurn ? 'Сіздің кезегіңіз' : `${turnPlayer?.name ?? 'Қарсылас'} жүреді`;
  let hint = myTurn ? 'Ату үшін алдымен сұраққа жауап беріңіз.' : 'Ол сұраққа жауап беріп жатыр.';
  if (aiming) {
    title = 'Атыңыз';
    hint = 'Қарсылас алаңындағы атылмаған ұяшықты таңдаңыз.';
  }
  if (pub.phase === 'bot') {
    title = 'Демо-бот ойланып жатыр…';
    hint = '';
  }
  if (finished) {
    title = 'Шайқас аяқталды';
    hint = (enemy?.ships_left ?? 0) === 0 ? 'Қарсыластың барлық кемесі батты.' : 'Сіздің барлық кемеңіз батты.';
  }
  const enemySunk = fleetSize - (enemy?.ships_left ?? fleetSize);

  const enemyCell = (i: number) => {
    const shot = enemy?.board[String(i)];
    const sunk = enemy?.sunk.some((s) => s.includes(i));
    if (shot === 'hit' || sunk) return { mark: '×', aria: sunk ? 'батқан кеме' : 'тиді', style: { background: sunk ? '#7F1D1D' : '#B42323', color: '#FFFFFF' } };
    if (shot === 'miss') return { mark: '•', aria: 'мүлт', style: { background: '#EEF2F7', color: '#5E6B7D' } };
    return { mark: '', aria: 'атылмаған', style: { background: '#DDE7F5', color: '#1E3A5F' } as CSSProperties };
  };

  return (
    <div className="flex flex-col gap-3">
      <StatusBanner title={title} hint={hint || undefined} accent={aiming ? '#1E3A5F' : '#111111'} />
      <div className="flex justify-end">
        <Countdown deadline={pub.phase === 'question' ? null : pub.deadline} />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-sm font-semibold">{enemy?.name ?? 'Қарсылас'} флоты</h2>
          <span className="text-[13px] text-bl-ink3">
            Батқан кеме: {enemySunk} / {fleetSize}
          </span>
        </div>
        <Grid
          label="Қарсылас алаңы"
          onCell={(i) => void act({ type: 'shoot', cell: i })}
          cells={(i) => {
            const base = enemyCell(i);
            const enabled = aiming && !enemy?.board[String(i)] && !busy;
            return {
              ...base,
              enabled,
              style: enabled ? { ...base.style, outline: '2px solid #1E3A5F', outlineOffset: -2 } : base.style,
            };
          }}
        />
      </section>

      {mySeat !== null ? (
        <section className="flex items-start gap-3.5 rounded-[14px] border border-bl-line bg-white p-3">
          <div
            role="img"
            aria-label={`Сіздің флотыңыз: ${me?.ships_left ?? 0} кеме қалды`}
            className="grid flex-none grid-cols-[repeat(6,18px)] gap-0.5"
          >
            {Array.from({ length: SIZE * SIZE }, (_, i) => {
              const st = me?.board[String(i)];
              const ship = myShips.has(i);
              const bg = st === 'hit' ? '#B42323' : st === 'miss' ? '#EEF2F7' : ship ? '#4A4A4A' : '#DDE7F5';
              return (
                <i
                  key={i}
                  className="block h-[18px] w-[18px] rounded"
                  style={{ background: bg, boxShadow: st === 'miss' ? 'inset 0 0 0 6px #EEF2F7, inset 0 0 0 9px #8C9AAD' : undefined }}
                />
              );
            })}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold">Сіздің флотыңыз</span>
            <span className="text-[13px] text-bl-ink3">
              Қалған кеме: {me?.ships_left ?? 0} / {fleetSize}
            </span>
            {pub.last?.result ? (
              <span className="text-[13px] leading-[1.4]">
                {pub.last.seat === mySeat ? 'Сіз: ' : `${turnPlayer?.name ?? 'Қарсылас'}: `}
                {pub.last.result === 'miss' ? 'мүлт кетті.' : pub.last.result === 'sunk' ? 'кеме батты!' : 'тиді!'}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {pub.phase === 'question' && pub.question ? (
        <QuestionPanel
          question={pub.question}
          canAnswer={myTurn}
          busy={busy}
          sheet
          tag="Сұрақ · оқ"
          tagStyle={{ background: '#DDE7F5', color: '#1E3A5F' }}
          onAnswer={(option) => void act({ type: 'answer', option })}
          note={myTurn ? 'Дұрыс жауап берсеңіз, атасыз.' : `${turnPlayer?.name ?? ''} сұраққа жауап беріп жатыр.`}
        />
      ) : null}
      {!pub.last?.result ? <LastAnswer last={pub.last} /> : null}
    </div>
  );
}