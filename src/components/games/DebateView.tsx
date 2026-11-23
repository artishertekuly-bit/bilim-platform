// Дебат аренасы (geimifikatsiya §4.4, D51, D52): үш раунд, ЖИ-төреші. Баға ресми емес.
import { useState } from 'react';

import { Card, Chip, PrimaryButton } from '@/components/exam/ExamUi';
import { Countdown, SeatDot } from '@/components/games/GameUi';
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

export default function DebateView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as DebatePublic;
  const priv = view.private as DebatePrivate;
  const [draft, setDraft] = useState('');
  const round = pub.rounds.find((r) => r.round === pub.round) ?? pub.rounds[0];
  const mine = (priv.my_entries ?? []).find((e) => e.round === pub.round);
  const canWrite = view.me.seat !== null && pub.phase === 'writing' && !mine;
  const opponent = pub.players.find((p) => p.seat !== view.me.seat);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    await act({ type: 'submit', text });
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2 p-4">
        <span className="text-xs text-[#5E5E5E]">{pub.topic.paragraph} · Тұжырым</span>
        <p className="m-0 text-[17px] font-semibold leading-snug">«{pub.topic.statement}»</p>
        <div className="flex flex-wrap gap-2">
          {pub.players.map((p) => (
            <Chip key={p.seat} tone={p.side === priv.side ? 'good' : 'neutral'}>
              {p.name}: {SIDE_LABEL[p.side]}
            </Chip>
          ))}
        </div>
        {priv.side ? (
          <p className="m-0 text-sm text-[#4A4A4A]">
            Сен тұжырымды <b>{priv.side === 'pro' ? 'жақтайсың' : 'теріске шығарасың'}</b>. Оқулықтағы фактілерге сүйен.
          </p>
        ) : null}
      </Card>

      {pub.rounds.map((r) => {
        const rows = pub.entries.filter((e) => e.round === r.round);
        if (!rows.length) return null;
        return (
          <div key={r.round} className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">{r.round}-раунд · {r.name}</span>
            {rows.map((e) => (
              <Card key={`${r.round}-${e.seat}`} className={cn('p-3 text-[15px]', e.side === priv.side && 'border-[#111111]')}>
                <span className="mb-1 flex items-center gap-1.5 text-xs text-[#5E5E5E]">
                  <SeatDot seat={e.seat} /> {SIDE_LABEL[e.side]}
                </span>
                {e.text}
              </Card>
            ))}
          </div>
        );
      })}

      {pub.phase === 'writing' ? (
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <b>{round.round}-раунд · {round.name}</b>
            <Countdown deadline={pub.deadline} />
          </div>
          {canWrite ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, round.limit))}
                rows={5}
                maxLength={round.limit}
                placeholder={round.round === 2 ? 'Қарсыластың уәжіне жауап бер…' : 'Дәлеліңді жаз…'}
                className="w-full resize-none rounded-xl border border-[#D9D6D0] p-3 text-[15px] outline-none focus:border-[#111111]"
              />
              <div className="flex items-center justify-between text-xs text-[#5E5E5E]">
                <span>Мәтінді қарсылас раунд біткенде көреді.</span>
                <span className="tabular-nums">{draft.length}/{round.limit}</span>
              </div>
              <PrimaryButton disabled={busy || !draft.trim()} onClick={() => void submit()}>Жіберу</PrimaryButton>
            </>
          ) : (
            <p className="m-0 text-sm text-[#4A4A4A]">
              {mine ? (mine.hidden ? 'Мәтінің ережені бұзғандықтан қарсыласқа көрсетілмейді.' : 'Жіберілді.') : ''}{' '}
              {opponent && !opponent.submitted ? `${opponent.name} әлі жазып жатыр.` : ''}
            </p>
          )}
        </Card>
      ) : null}

      {pub.phase === 'judging' ? <Card className="p-4 text-sm">ЖИ-төреші дебатты бағалап жатыр…</Card> : null}

      {pub.phase === 'finished' && pub.verdict ? (
        <Card className="flex flex-col gap-2 p-4">
          <b>
            {pub.verdict.winner ? `Жеңімпаз: ${SIDE_LABEL[pub.verdict.winner]}` : pub.verdict.unavailable ? 'Бағаланбады' : 'Тең түсті'}
          </b>
          {pub.verdict.summary ? <p className="m-0 text-sm">{pub.verdict.summary}</p> : null}
          {pub.verdict.scores ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-[#5E5E5E]"><th /><th>Логика</th><th>Факт</th><th>Жауап</th></tr></thead>
              <tbody>
                {(['pro', 'con'] as Side[]).map((side) => (
                  <tr key={side}>
                    <td className="font-semibold">{SIDE_LABEL[side]}</td>
                    <td>{pub.verdict?.scores?.[side].logic}</td>
                    <td>{pub.verdict?.scores?.[side].facts}</td>
                    <td>{pub.verdict?.scores?.[side].response}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {priv.side && pub.verdict.tips?.[priv.side] ? (
            <p className="m-0 rounded-xl bg-[#F6F5F2] p-3 text-sm">Кеңес: {pub.verdict.tips[priv.side]}</p>
          ) : null}
          <p className="m-0 text-xs text-[#5E5E5E]">Бұл баға ресми емес, емтихан нәтижесіне кірмейді.</p>
        </Card>
      ) : null}
    </div>
  );
}
