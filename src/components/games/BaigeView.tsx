// Бәйге (geimifikatsiya §4.5, D55): тоқтау не тәуекел. Кездейсоқтық емес, білім шешеді.
import { Card, Chip } from '@/components/exam/ExamUi';
import { Countdown, QuestionPanel, SeatDot, type QuestionView } from '@/components/games/GameUi';
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

export default function BaigeView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as BaigePublic;
  const priv = view.private as BaigePrivate;
  const mySeat = view.me.seat;
  const riding = Boolean(priv.riding);
  const best = Math.max(1, ...pub.players.map((p) => p.banked + p.unbanked), pub.stages * MAX_STAGE_POINTS / 3);
  const myResult = mySeat !== null ? pub.last?.players?.[String(mySeat)] : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip>{pub.stage}/{pub.stages}-кезең</Chip>
        <Chip tone="good">Сұрақ құны: {pub.value}</Chip>
        <Countdown deadline={pub.deadline} />
      </div>

      <Card className="flex flex-col gap-2.5 p-3">
        {pub.players.map((p) => {
          const width = Math.min(100, ((p.banked + p.unbanked) / best) * 100);
          return (
            <div key={p.seat} className={cn('flex flex-col gap-1', p.left && 'opacity-50')}>
              <div className="flex items-center gap-1.5 text-sm">
                <SeatDot seat={p.seat} /> <b className="truncate">{p.name}</b>
                <span className="ml-auto text-xs text-[#5E5E5E]">
                  {p.banked}{p.unbanked ? ` + ${p.unbanked}` : ''} · {STATUS[p.status]}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#ECE9E3]">
                <div className="h-full rounded-full bg-[#111111] transition-all" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </Card>

      {pub.phase === 'decide' && pub.next ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="m-0 text-sm text-[#4A4A4A]">Келесі сұрақ: <b>{pub.next.paragraph}</b>, құны <b>{pub.next.value}</b> ұпай.</p>
          {riding && !priv.my_decision ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => void act({ type: 'decide', choice: 'stop' })}
                className="h-12 rounded-[14px] border border-[#D9D6D0] bg-white font-semibold">Тоқтау</button>
              <button type="button" disabled={busy} onClick={() => void act({ type: 'decide', choice: 'continue' })}
                className="h-12 rounded-[14px] bg-[#121212] font-semibold text-white">Жалғастыру</button>
            </div>
          ) : (
            <p className="m-0 text-sm">{priv.my_decision === 'continue' ? 'Шабасың! Басқаларды күтуде…' : riding ? '' : 'Бұл кезеңде сен шаппайсың.'}</p>
          )}
          <p className="m-0 text-xs text-[#5E5E5E]">Тоқтасаң, кезеңнің ұпайы сақталады. Қате жауап берсең, аттан құлап, оны жоғалтасың.</p>
        </Card>
      ) : null}

      {pub.phase === 'question' && pub.question ? (
        riding && mySeat !== null && pub.question.to.includes(view.me.user_id) ? (
          <QuestionPanel question={pub.question} canAnswer busy={busy} chosen={priv.my_answer}
            onAnswer={(option) => void act({ type: 'answer', option })}
            note={priv.my_answer ? 'Жауап қабылданды. Басқаларды күтуде…' : null} />
        ) : (
          <Card className="p-4 text-sm">{mySeat === null ? 'Ойыншылар сұраққа жауап беріп жатыр.' : 'Бұл кезеңде сен шаппайсың. Келесі кезеңді күт.'}</Card>
        )
      ) : null}

      {myResult ? (
        <p className={cn('m-0 text-sm font-semibold', myResult.ok ? 'text-[#1F6B3F]' : 'text-[#B42323]')}>
          {myResult.ok ? `Дұрыс! +${pub.last?.value}` : 'Қате — аттан құладың.'}
        </p>
      ) : null}
    </div>
  );
}
