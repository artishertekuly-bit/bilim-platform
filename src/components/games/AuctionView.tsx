// Білім аукционы (D99): ставка сұрақты көрмей қойылады — тек тақырыбы мен қиындығы көрінеді. Дұрыс жауап
// ставканы еселейді, қате не уақыт бітсе — ставка күйеді. Ставка сұрақ ашылған соң өзгермейді (сервер тексереді).
import { useState } from 'react';

import { Countdown, QuestionPanel, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { SEAT_COLORS } from '@/lib/games-api';
import { BET_PRESETS, BET_STEP, clampBet } from '@/lib/games-ui';
import { cn } from '@/lib/utils';

interface Player { id: string; seat: number; name: string; left: boolean; balance: number; bet_placed: boolean }
interface AuctionPublic {
  rounds: number;
  round: number;
  phase: 'bet' | 'answer' | 'finished';
  deadline: string | null;
  min_bet: number;
  players: Player[];
  lot: { paragraph: string; difficulty: number; tier: string } | null;
  question: QuestionView | null;
  granted: number[];
  last: { round: number; right_option: string; players: Record<string, { ok: boolean; bet: number; delta: number; auto: boolean }> } | null;
}
interface AuctionPrivate { balance?: number; my_bet?: number | null; my_answer?: string | null; max_bet?: number }

export default function AuctionView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as AuctionPublic;
  const priv = view.private as AuctionPrivate;
  const mySeat = view.me.seat;
  const isPlayer = mySeat !== null && !view.me.left && priv.balance !== undefined;
  const balance = priv.balance ?? 0;
  const [draft, setDraft] = useState<number | null>(null);
  const bet = clampBet(draft ?? priv.my_bet ?? balance / 4, pub.min_bet, balance);
  const mine = mySeat !== null ? pub.last?.players?.[String(mySeat)] : undefined;
  const asked = pub.phase === 'answer' && pub.question && isPlayer && pub.question.to.includes(view.me.user_id);
  const color = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 text-[13px] text-bl-ink3">
        <span className="font-semibold text-bl-ink">
          {pub.round}/{pub.rounds}-раунд
        </span>
        {pub.phase !== 'finished' ? <Countdown deadline={pub.phase === 'answer' ? null : pub.deadline} label="Ставка" /> : null}
      </div>

      <section aria-label="Балансы" className="flex flex-col gap-1.5 rounded-2xl border border-bl-line bg-white p-3">
        {pub.players.map((p) => (
          <div key={p.seat} className={cn('flex items-center justify-between gap-2 text-[14px]', p.left && 'opacity-50')}>
            <span className="flex min-w-0 items-center gap-1.5 font-semibold">
              <i aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: color(p.seat) }} />
              <span className="truncate">{p.seat === mySeat ? 'Сіз' : p.name}</span>
            </span>
            <span className="flex items-center gap-2 whitespace-nowrap tabular-nums">
              {pub.phase === 'bet' ? (
                <span className="text-xs text-bl-ink2">{p.bet_placed ? 'ставка қойды' : 'ойланып жатыр'}</span>
              ) : null}
              <span className="font-semibold">{p.balance}</span>
            </span>
          </div>
        ))}
      </section>

      {mine && pub.phase !== 'finished' ? (
        <p
          role="status"
          className={cn('m-0 rounded-[14px] px-3.5 py-3 text-[15px] font-semibold', mine.ok ? 'bg-bl-okbg text-[#14532D]' : 'bg-bl-badbg text-bl-badtext')}
        >
          {mine.ok ? `Дұрыс! Ставка еселенді: +${mine.delta}` : `Қате: ставка күйді, −${Math.abs(mine.delta)}`}
        </p>
      ) : null}

      {pub.phase === 'bet' && pub.lot ? (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
          <div className="flex flex-col gap-1 rounded-xl bg-bl-bg p-3">
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">Лот</span>
            <span className="text-base font-semibold">{pub.lot.paragraph || 'Жалпы тақырып'}</span>
            <span className="text-sm text-bl-ink3">Қиындығы: {pub.lot.tier}</span>
          </div>
          {mySeat !== null && pub.granted.includes(mySeat) ? (
            <p className="m-0 text-sm text-bl-ink3">Балансыңыз азайып кетті: ойыннан қалмауыңыз үшін +100 ұпай берілді.</p>
          ) : null}
          {isPlayer ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-bl-ink3">Ставкаңыз · балансыңыз {balance}</span>
                <span className="text-[28px] font-bold tabular-nums">{bet}</span>
              </div>
              <input
                type="range"
                aria-label="Ставка"
                min={pub.min_bet}
                max={Math.max(pub.min_bet, balance)}
                step={BET_STEP}
                value={bet}
                disabled={busy}
                onChange={(e) => setDraft(Number(e.target.value))}
                className="w-full accent-[#111111]"
              />
              <div className="grid grid-cols-4 gap-2">
                {BET_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft(clampBet(balance * p.share, pub.min_bet, balance))}
                    className="h-10 rounded-[12px] border border-bl-field bg-white text-[13px] font-semibold text-bl-ink"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ type: 'bet', amount: bet })}
                className="h-[52px] rounded-[14px] border-0 bg-bl-btn text-[15px] font-semibold text-white"
              >
                {priv.my_bet ? `Ставканы өзгерту: ${bet}` : `Ставка қою: ${bet}`}
              </button>
              <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
                {priv.my_bet
                  ? `Ставкаңыз: ${priv.my_bet}. Сұрақ ашылғанша өзгерте аласыз.`
                  : `Ең аз ставка — ${pub.min_bet}. Ставка қоймасаңыз, ${pub.min_bet} қойылады.`}
              </p>
            </>
          ) : (
            <p className="m-0 text-sm text-bl-ink3">Ойыншылар ставка қойып жатыр.</p>
          )}
        </section>
      ) : null}

      {pub.phase === 'answer' && pub.question ? (
        asked ? (
          <QuestionPanel
            question={pub.question}
            canAnswer
            busy={busy}
            chosen={priv.my_answer}
            tag={`${pub.lot?.paragraph ?? pub.question.paragraph} · ставка ${priv.my_bet ?? pub.min_bet}`}
            onAnswer={(option) => void act({ type: 'answer', option })}
          />
        ) : (
          <p className="m-0 rounded-[14px] border border-bl-line bg-white px-3.5 py-3 text-sm">Ойыншылар сұраққа жауап беріп жатыр.</p>
        )
      ) : null}
    </div>
  );
}
