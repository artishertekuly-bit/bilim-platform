// «Сенемін — Сенбеймін» (D99): тұжырымға сенесіз бе? «Сенбеймін» таңдалса — дұрыс түзетуді таңдайсыз.
// Шындық пен түзету раунд жабылғанша серверде қалады, кейін түсіндірмесімен ашылады.
import { useState } from 'react';

import { Countdown } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { SEAT_COLORS } from '@/lib/games-api';
import { cn } from '@/lib/utils';

interface Statement {
  qid: string;
  paragraph: string;
  difficulty: number;
  stem: string;
  claim: string | null;
  options: { id: string; text: string }[];
  to: string[];
  deadline: string;
  answered: string[];
}
interface PlayerRow { id: string; seat: number; name: string; left: boolean; score: number; answered: boolean }
interface FactPublic {
  rounds: number;
  round: number;
  phase: 'question' | 'reveal' | 'finished';
  deadline: string | null;
  points: { true: number; spot: number; bonus: number };
  players: PlayerRow[];
  statement: Statement | null;
  last: {
    stem: string;
    claim: string | null;
    truth: boolean;
    fix_text: string | null;
    explanation: string;
    players: Record<string, { points: number; ok: boolean | null; fixed: boolean; choice: string | null }>;
  } | null;
}
interface FactPrivate { score?: number; my_answer?: { choice: 'true' | 'false'; option?: string } | null; ready?: boolean }

const BIG = 'h-[56px] flex-1 rounded-[14px] text-[16px] font-semibold';

function StatementText({ stem, claim }: { stem: string; claim: string | null }) {
  if (!claim) return <p className="m-0 text-[17px] font-semibold leading-[1.4]">{stem}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-[15px] leading-[1.4] text-bl-ink3">{stem}</p>
      <p className="m-0 text-[17px] font-semibold leading-[1.4]">Жауабы: {claim}</p>
    </div>
  );
}

function VerdictCard({ statement, points, busy, onVerdict }: {
  statement: Statement;
  points: FactPublic['points'];
  busy: boolean;
  onVerdict: (choice: 'true' | 'false', option?: string) => void;
}) {
  const [doubt, setDoubt] = useState(false);
  return (
    <section aria-label="Тұжырым" className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">{statement.paragraph || 'Тұжырым'}</span>
        <Countdown deadline={statement.deadline} />
      </div>
      <StatementText stem={statement.stem} claim={statement.claim} />
      {!doubt ? (
        <>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => onVerdict('true')} className={cn(BIG, 'border-0 bg-bl-btn text-white')}>
              Сенемін
            </button>
            <button type="button" disabled={busy} onClick={() => setDoubt(true)} className={cn(BIG, 'border border-bl-field bg-white text-bl-ink')}>
              Сенбеймін
            </button>
          </div>
          <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
            Дұрысына сенсеңіз — {points.true}. Қатесін аңғарсаңыз — {points.spot}, дұрыс түзетсеңіз — тағы +{points.bonus}.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Дұрысы қайсы?</span>
          {statement.options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={busy}
              onClick={() => onVerdict('false', o.id)}
              className="min-h-[48px] rounded-[14px] border border-bl-field bg-white px-3.5 py-2.5 text-left text-[15px] text-bl-ink"
            >
              {o.text}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => setDoubt(false)} className="h-10 text-sm font-semibold text-bl-ink3">
            Артқа
          </button>
        </div>
      )}
    </section>
  );
}

export default function FactCheckView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as FactPublic;
  const priv = view.private as FactPrivate;
  const mySeat = view.me.seat;
  const isPlayer = mySeat !== null && !view.me.left && priv.score !== undefined;
  const statement = pub.statement;
  const asked = pub.phase === 'question' && statement && isPlayer && statement.to.includes(view.me.user_id);
  const mine = mySeat !== null ? pub.last?.players?.[String(mySeat)] : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 text-[13px] text-bl-ink3">
        <span className="font-semibold text-bl-ink">
          {pub.round}/{pub.rounds}-раунд
        </span>
        {isPlayer ? <span className="tabular-nums">Ұпайыңыз: {priv.score}</span> : null}
      </div>

      <section aria-label="Ұпай" className="flex flex-wrap gap-1.5">
        {pub.players.map((p) => (
          <span
            key={p.seat}
            className={cn('flex items-center gap-1.5 rounded-full border border-bl-line bg-white px-2.5 py-1 text-[13px]', p.left && 'opacity-50')}
          >
            <i aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }} />
            {p.seat === mySeat ? 'Сіз' : p.name} · <b className="tabular-nums">{p.score}</b>
            {pub.phase === 'question' && p.answered ? <span aria-label="жауап берді">✓</span> : null}
          </span>
        ))}
      </section>

      {pub.phase === 'question' && statement ? (
        asked && !priv.my_answer ? (
          <VerdictCard
            key={statement.qid}
            statement={statement}
            points={pub.points}
            busy={busy}
            onVerdict={(choice, option) => void act(choice === 'true' ? { type: 'verdict', choice } : { type: 'verdict', choice, option: option ?? '' })}
          />
        ) : (
          <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
            <StatementText stem={statement.stem} claim={statement.claim} />
            <p role="status" className="m-0 rounded-xl bg-bl-soft px-3.5 py-3 text-sm font-semibold">
              {priv.my_answer
                ? `Жауабыңыз: ${priv.my_answer.choice === 'true' ? 'Сенемін' : 'Сенбеймін'}. Басқаларды күтудеміз…`
                : 'Ойыншылар жауап беріп жатыр.'}
            </p>
          </section>
        )
      ) : null}

      {pub.phase === 'reveal' && pub.last ? (
        <section aria-label="Раунд нәтижесі" className="flex flex-col gap-3 rounded-2xl border border-bl-line bg-white p-4">
          <StatementText stem={pub.last.stem} claim={pub.last.claim} />
          <p className={cn('m-0 rounded-xl px-3.5 py-3 text-[15px] font-semibold', pub.last.truth ? 'bg-bl-okbg text-[#14532D]' : 'bg-bl-badbg text-bl-badtext')}>
            {pub.last.truth ? 'Тұжырым дұрыс' : `Тұжырым қате · дұрысы: ${pub.last.fix_text ?? '—'}`}
          </p>
          <p className="m-0 text-sm leading-[1.45] text-bl-ink3">{pub.last.explanation}</p>
          {mine ? (
            <p role="status" className="m-0 text-[15px] font-semibold">
              {mine.choice === null ? 'Уақыт бітті: 0 ұпай.' : mine.points ? `+${mine.points} ұпай${mine.fixed ? ' · түзету дұрыс' : ''}` : 'Бұл жолы ұпай жоқ.'}
            </p>
          ) : null}
          {isPlayer && !priv.ready ? (
            <button type="button" disabled={busy} onClick={() => void act({ type: 'next' })} className="h-[48px] rounded-[14px] border-0 bg-bl-btn text-[15px] font-semibold text-white">
              Келесі тұжырым
            </button>
          ) : (
            <Countdown deadline={pub.deadline} label="Келесісі" />
          )}
        </section>
      ) : null}
    </div>
  );
}
