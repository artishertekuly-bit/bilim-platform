// Бәйге (geimifikatsiya §4.5, D55): тоқтау не тәуекел. Кездейсоқтық емес, білім шешеді.
import { SEAT_COLORS } from '@/lib/games-api';
import { Countdown, QuestionPanel, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { cn } from '@/lib/utils';

interface Player {
  id: string; seat: number; name: string; left: boolean; banked: number; unbanked: number;
  status: 'riding' | 'stopped' | 'fell' | 'finished_stage'; decided: boolean;
}
interface BaigePublic {
  stages: number;
  stage: number;
  value: number;
  phase: 'question' | 'decide' | 'finished';
  deadline: string | null;
  players: Player[];
  next: { paragraph: string; value: number } | null;
  question: QuestionView | null;
  last: { stage: number; value: number; right_option?: string; players?: Record<string, { ok: boolean }>; all_stopped?: boolean } | null;
}
interface BaigePrivate { riding?: boolean; my_answer?: string | null; my_decision?: string | null }

const STATUS: Record<Player['status'], string> = {
  riding: 'шауып келеді', stopped: 'тоқтады', fell: 'аттан құлады', finished_stage: 'мәреге жетті',
};
const MAX_STAGE_POINTS = 15;

// Дизайн: Baige.dc.html — кезең жолдары (қою түс сақталған, ашық түс сақталмаған ұпай), «Тоқтау / Шабу» картасы, сұрақ парағы.
export default function BaigeView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as BaigePublic;
  const priv = view.private as BaigePrivate;
  const mySeat = view.me.seat;
  const riding = Boolean(priv.riding);
  const best = Math.max(1, ...pub.players.map((p) => p.banked + p.unbanked), (pub.stages * MAX_STAGE_POINTS) / 3);
  const myResult = mySeat !== null ? pub.last?.players?.[String(mySeat)] : undefined;
  const me = pub.players.find((p) => p.seat === mySeat);
  const color = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];
  const asked = pub.phase === 'question' && pub.question && riding && mySeat !== null && pub.question.to.includes(view.me.user_id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 text-[13px] text-bl-ink3">
        <span className="font-semibold text-bl-ink">
          {pub.stage}/{pub.stages}-кезең
        </span>
        <span className="flex items-center gap-2">
          Сұрақ құны: +{pub.value}
          <Countdown deadline={pub.phase === 'question' ? null : pub.deadline} />
        </span>
      </div>

      <section aria-label="Бәйге жолы" className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-3">
        {pub.players.map((p) => {
          const banked = Math.min(100, (p.banked / best) * 100);
          const pot = Math.min(100 - banked, (p.unbanked / best) * 100);
          return (
            <div key={p.seat} className={cn('flex flex-col gap-1', p.left && 'opacity-50')}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                  <i aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: color(p.seat) }} />
                  <span className="truncate">{p.seat === mySeat ? 'Сіз' : p.name}</span>
                </span>
                <span className="whitespace-nowrap tabular-nums text-bl-ink3">
                  {p.banked}
                  {p.unbanked ? ` + ${p.unbanked}` : ''} · {STATUS[p.status]}
                </span>
              </div>
              <div aria-hidden="true" className="relative h-3 overflow-hidden rounded-full bg-[#F1EFEA]">
                <i className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${banked}%`, background: color(p.seat) }} />
                <i
                  className="absolute inset-y-0 transition-all"
                  style={{ left: `${banked}%`, width: `${pot}%`, background: color(p.seat), opacity: 0.35 }}
                />
              </div>
            </div>
          );
        })}
        <span className="text-xs text-bl-ink2">Қою түс — сақталған ұпай, ашық түс — кезеңдегі әлі сақталмаған ұпай.</span>
      </section>

      {pub.phase === 'decide' && pub.next ? (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-bl-ink3">Сақталмаған ұпайыңыз</span>
            <span className="text-[28px] font-bold tabular-nums">{me?.unbanked ?? 0}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-bl-bg p-3">
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">Келесі сұрақ</span>
            <span className="text-base font-semibold">{pub.next.paragraph}</span>
            <span className="text-sm text-bl-ink3">Құны +{pub.next.value}</span>
          </div>
          <p className="m-0 text-sm leading-[1.45] text-bl-ink3">
            Тоқтасаңыз, кезеңнің ұпайы сақталады. Қате жауап берсеңіз, аттан құлап, оны жоғалтасыз.
          </p>
          {riding && !priv.my_decision ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ type: 'decide', choice: 'stop' })}
                className="h-[52px] flex-1 rounded-[14px] border border-bl-field bg-white text-[15px] font-semibold text-bl-ink"
              >
                Тоқтау: {me?.unbanked ?? 0} сақтау
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ type: 'decide', choice: 'continue' })}
                className="h-[52px] flex-1 rounded-[14px] border-0 bg-bl-btn text-[15px] font-semibold text-white"
              >
                Шабу: +{pub.next.value}
              </button>
            </div>
          ) : (
            <p role="status" className="m-0 rounded-xl bg-bl-soft px-3.5 py-3 text-sm font-semibold">
              {priv.my_decision === 'continue'
                ? 'Шабасыз! Басқаларды күтудеміз…'
                : priv.my_decision === 'stop'
                  ? 'Тоқтадыңыз: ұпай сақталды.'
                  : 'Бұл кезеңде сіз шаппайсыз.'}
            </p>
          )}
        </section>
      ) : null}

      {pub.phase === 'question' && pub.question ? (
        asked ? (
          <QuestionPanel
            question={pub.question}
            canAnswer
            busy={busy}
            sheet
            chosen={priv.my_answer}
            tag={`${pub.question.paragraph} · +${pub.value}`}
            onAnswer={(option) => void act({ type: 'answer', option })}
          />
        ) : (
          <p className="m-0 rounded-[14px] border border-bl-line bg-white px-3.5 py-3 text-sm">
            {mySeat === null ? 'Ойыншылар сұраққа жауап беріп жатыр.' : 'Бұл кезеңде сіз шаппайсыз. Келесі кезеңді күтіңіз.'}
          </p>
        )
      ) : null}

      {myResult ? (
        <p
          role="status"
          className={cn(
            'm-0 rounded-[14px] px-3.5 py-3 text-[15px] font-semibold',
            myResult.ok ? 'bg-bl-okbg text-[#14532D]' : 'bg-bl-badbg text-bl-badtext',
          )}
        >
          {myResult.ok ? `Дұрыс! +${pub.last?.value}` : 'Қате: аттан құладыңыз, кезең ұпайы жоғалды.'}
        </p>
      ) : null}
    </div>
  );
}