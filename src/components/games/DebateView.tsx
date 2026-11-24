// Дебат аренасы (geimifikatsiya §4.4, D51, D52): үш раунд, ЖИ-төреші. Баға ресми емес.
import { Fragment, useState } from 'react';

import { Countdown } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { cn } from '@/lib/utils';

type Side = 'pro' | 'con';
interface Round { round: number; name: string; limit: number }
interface DebatePublic {
  topic: { statement: string; paragraph: string };
  rounds: Round[];
  players: { id: string; seat: number; name: string; left: boolean; side: Side; submitted: boolean }[];
  round: number;
  phase: 'writing' | 'judging' | 'finished';
  deadline: string | null;
  entries: { round: number; seat: number; side: Side; text: string }[];
  verdict: {
    winner: Side | null;
    scores?: Record<Side, { logic: number; facts: number; response: number }>;
    tips?: Record<Side, string>;
    summary?: string;
    unavailable?: boolean;
    forfeit?: boolean;
  } | null;
}
interface DebatePrivate { side?: Side; my_entries?: { round: number; text: string; hidden: boolean }[] }

const SIDE_LABEL: Record<Side, string> = { pro: 'Жақтаушы', con: 'Қарсы' };
const SIDE_STANCE: Record<Side, string> = { pro: 'Жақтаймын', con: 'Қарсымын' };
const CRITERIA: { key: 'logic' | 'facts' | 'response'; label: string }[] = [
  { key: 'logic', label: 'Дәлелдің логикасы' },
  { key: 'facts', label: 'Оқулықтағы фактіге сүйену' },
  { key: 'response', label: 'Қарсы уәжге жауап' },
];

// Дизайн: Debate.dc.html — тақырып картасы, үш раунд қадамы, чат көпіршіктері, төменде жазу аймағы, төреші шешімі.
export default function DebateView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as DebatePublic;
  const priv = view.private as DebatePrivate;
  const [draft, setDraft] = useState('');
  const round = pub.rounds.find((r) => r.round === pub.round) ?? pub.rounds[0];
  const mine = (priv.my_entries ?? []).find((e) => e.round === pub.round);
  const canWrite = view.me.seat !== null && pub.phase === 'writing' && !mine;
  const me = pub.players.find((p) => p.seat === view.me.seat);
  const opponent = pub.players.find((p) => p.seat !== view.me.seat);
  const finished = pub.phase === 'finished';

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    await act({ type: 'submit', text });
    setDraft('');
  };

  const verdict = pub.verdict;
  const verdictTitle = verdict
    ? verdict.winner
      ? verdict.winner === priv.side
        ? 'Сіз жеңдіңіз'
        : priv.side
          ? `${opponent?.name ?? 'Қарсылас'} жеңді`
          : `Жеңімпаз: ${SIDE_LABEL[verdict.winner]}`
      : verdict.unavailable
        ? 'Төреші бағалай алмады'
        : 'Тең түсті'
    : '';
  const mySide = priv.side;
  const otherSide: Side | undefined = mySide ? (mySide === 'pro' ? 'con' : 'pro') : undefined;

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2.5 rounded-2xl border border-bl-line bg-white p-3.5">
        <span className="text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">Тақырып · {pub.topic.paragraph}</span>
        <p className="m-0 text-base font-semibold leading-[1.45]">{pub.topic.statement}</p>
        <div className="grid grid-cols-2 gap-2">
          {[me, opponent].filter(Boolean).map((p) => {
            const isMe = p!.seat === view.me.seat;
            return (
              <span
                key={p!.seat}
                className={cn('flex flex-col gap-0.5 rounded-[10px] px-2.5 py-2', isMe ? 'bg-bl-ink text-white' : 'bg-bl-soft text-bl-ink')}
              >
                <span className={cn('text-xs', isMe ? 'opacity-80' : 'text-bl-ink3')}>{isMe ? 'Сіз' : p!.name}</span>
                <span className="text-sm font-bold">{SIDE_STANCE[p!.side]}</span>
              </span>
            );
          })}
        </div>
      </section>

      <ol aria-label="Раундтар" className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
        {pub.rounds.map((r) => {
          const done = r.round < pub.round || pub.phase !== 'writing';
          const current = r.round === pub.round && pub.phase === 'writing';
          return (
            <li
              key={r.round}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex flex-col gap-0.5 rounded-[10px] px-2.5 py-2',
                done ? 'bg-bl-okbg text-[#14532D]' : current ? 'bg-bl-ink text-white' : 'bg-bl-soft text-bl-ink3',
              )}
            >
              <span className="text-[11px] font-semibold">{r.round}-раунд</span>
              <span className="text-[13px] font-semibold">{r.name}</span>
            </li>
          );
        })}
      </ol>

      {pub.rounds.map((r) => {
        const rows = pub.entries.filter((e) => e.round === r.round);
        return rows.map((e) => {
          const isMe = e.side === mySide;
          return (
            <div key={`${r.round}-${e.seat}`} className={cn('flex max-w-[86%] flex-col gap-1', isMe ? 'self-end items-end' : 'self-start')}>
              <span className="text-xs text-bl-ink2">
                {isMe ? 'Сіз' : pub.players.find((p) => p.seat === e.seat)?.name ?? SIDE_LABEL[e.side]} · {r.round}-раунд
              </span>
              <div
                className={cn(
                  'whitespace-pre-wrap px-3.5 py-3 text-[15px] leading-[1.45]',
                  isMe ? 'rounded-[16px_16px_4px_16px] bg-bl-ink text-white' : 'rounded-[16px_16px_16px_4px] border border-bl-line bg-white',
                )}
              >
                {e.text}
              </div>
            </div>
          );
        });
      })}

      {pub.phase === 'writing' && !canWrite ? (
        <div
          role="status"
          className="self-start rounded-[16px_16px_16px_4px] border border-bl-line bg-white px-3.5 py-3 text-sm text-bl-ink2"
        >
          {mine?.hidden
            ? 'Мәтініңіз ережені бұзғандықтан қарсыласқа көрсетілмейді.'
            : opponent && !opponent.submitted
              ? `${opponent.name} жазып жатыр…`
              : 'Жіберілді. Раунд жабылуын күтіңіз.'}
        </div>
      ) : null}

      {pub.phase === 'judging' ? (
        <div role="status" className="flex flex-col gap-2 rounded-[14px] border border-bl-line bg-white p-3.5">
          <span className="text-[15px] font-semibold">ЖИ-төреші дебатты бағалап жатыр…</span>
          <div aria-hidden="true" className="h-2.5 w-4/5 animate-pulse rounded-md bg-bl-soft" />
          <div aria-hidden="true" className="h-2.5 w-3/5 animate-pulse rounded-md bg-bl-soft" />
        </div>
      ) : null}

      {finished && verdict ? (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">Төрешінің шешімі</span>
          <span className="text-[22px] font-bold">{verdictTitle}</span>
          {verdict.summary ? <p className="m-0 text-sm leading-[1.45]">{verdict.summary}</p> : null}
          {verdict.scores && mySide && otherSide ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3.5 gap-y-2 text-sm">
              <span className="text-xs text-bl-ink2">Критерий</span>
              <span className="text-xs text-bl-ink2">Сіз</span>
              <span className="text-xs text-bl-ink2">{opponent?.name.split(' ')[0] ?? 'Қарсылас'}</span>
              {CRITERIA.map((c) => (
                <Fragment key={c.key}>
                  <span>{c.label}</span>
                  <span className="font-bold tabular-nums">{verdict.scores?.[mySide][c.key]} / 4</span>
                  <span className="font-bold tabular-nums">{verdict.scores?.[otherSide][c.key]} / 4</span>
                </Fragment>
              ))}
            </div>
          ) : null}
          {mySide && verdict.tips?.[mySide] ? (
            <p className="m-0 rounded-xl bg-bl-bg p-3 text-sm leading-[1.45]">
              <b>Сізге кеңес:</b> {verdict.tips[mySide]}
            </p>
          ) : null}
          <p className="m-0 text-xs text-bl-ink2">Бұл баға ресми емес, емтихан нәтижесіне кірмейді.</p>
        </section>
      ) : null}

      {canWrite ? (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-bl-line bg-bl-bg px-4 pb-4 pt-2.5">
          <div className="flex justify-between text-[13px] text-bl-ink3">
            <label htmlFor="debate-arg" className="font-semibold text-bl-ink">
              {round.round}-раунд · {round.name}
            </label>
            <span className="flex items-center gap-2 tabular-nums">
              {draft.length} / {round.limit}
              <Countdown deadline={pub.deadline} />
            </span>
          </div>
          <textarea
            id="debate-arg"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, round.limit))}
            rows={4}
            maxLength={round.limit}
            placeholder={round.round === 2 ? 'Қарсыластың уәжіне жауап беріңіз…' : 'Дәлеліңізді жазыңыз. Оқулықтағы фактіге сүйеніңіз.'}
            className="box-border w-full resize-none rounded-[14px] border border-bl-field bg-white px-3.5 py-3 text-base leading-[1.45] text-bl-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
          />
          <p className="m-0 text-xs text-bl-ink2">Мәтінді қарсылас раунд біткенде көреді.</p>
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void submit()}
            className={cn(
              'h-12 rounded-[14px] border-0 text-base font-semibold',
              !busy && draft.trim() ? 'bg-bl-btn text-white' : 'bg-bl-handle text-bl-ink3',
            )}
          >
            {busy ? 'Жіберілуде…' : 'Жіберу'}
          </button>
        </div>
      ) : null}
    </div>
  );
}