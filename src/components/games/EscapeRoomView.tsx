// «Эскейп рум» (D99): бес құлып кезекпен ашылады. Әр құлып — бір сұрақ, ашылса шығыс кодының бір таңбасы.
// Келесі құлыптың сұрағы алдыңғысы ашылмайынша серверден келмейді. Қате жауап — +10 с айыппұл және жаңа сұрақ.
import { useState } from 'react';

import { Countdown, QuestionPanel, type QuestionView } from '@/components/games/GameUi';
import type { GameViewProps } from '@/components/games/types';
import { SEAT_COLORS } from '@/lib/games-api';
import { formatTime } from '@/lib/games-ui';
import { cn } from '@/lib/utils';

interface Runner { id: string; seat: number; name: string; left: boolean; solved: number; escaped: boolean; penalty: number; time_s: number | null }
interface EscapePublic {
  locks: number;
  lock_names: string[];
  penalty_s: number;
  phase: 'playing' | 'finished';
  deadline: string | null;
  players: Runner[];
}
interface EscapePrivate {
  stage?: number;
  solved?: number;
  penalty?: number;
  code_slots?: (string | null)[];
  challenge?: QuestionView | null;
  need_code?: boolean;
  escaped?: boolean;
  time_s?: number | null;
  feedback?: { ok: boolean; lock?: number; char?: string; penalty?: number; code?: boolean; escaped?: boolean } | null;
}

function feedbackText(f: NonNullable<EscapePrivate['feedback']>, penalty: number): string {
  if (f.escaped) return 'Есік ашылды!';
  if (f.ok) return `${f.lock}-құлып ашылды. Код таңбасы: ${f.char}`;
  if (f.code) return `Код қате: +${f.penalty ?? penalty} с айыппұл.`;
  return `Қате: +${f.penalty ?? penalty} с айыппұл. Құлыпқа жаңа сұрақ берілді.`;
}

export default function EscapeRoomView({ view, act, busy }: GameViewProps) {
  const pub = view.public as unknown as EscapePublic;
  const priv = view.private as EscapePrivate;
  const mySeat = view.me.seat;
  const isPlayer = mySeat !== null && !view.me.left && priv.solved !== undefined;
  const solved = priv.solved ?? 0;
  const slots = priv.code_slots ?? Array.from({ length: pub.locks }, () => null);
  const current = Math.min(priv.stage ?? 1, pub.locks);
  const [code, setCode] = useState('');
  const ordered = [...pub.players].sort((a, b) => Number(b.escaped) - Number(a.escaped) || b.solved - a.solved);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 text-[13px] text-bl-ink3">
        <span className="font-semibold text-bl-ink">{isPlayer ? `Құлып ${Math.min(solved + 1, pub.locks)}/${pub.locks}` : 'Эскейп рум'}</span>
        <span className="flex items-center gap-2">
          {isPlayer && priv.penalty ? <span className="tabular-nums">Айыппұл: +{priv.penalty} с</span> : null}
          {pub.phase === 'playing' ? <Countdown deadline={pub.deadline} /> : null}
        </span>
      </div>

      {isPlayer ? (
        <section aria-label="Құлыптар" className="flex flex-col gap-3 rounded-2xl border border-bl-line bg-white p-3">
          <ol aria-label={`Ашылған құлып: ${solved}/${pub.locks}`} className="m-0 grid list-none grid-cols-5 gap-1.5 p-0">
            {pub.lock_names.map((name, i) => (
              <li key={name} className="flex flex-col gap-1">
                <i
                  aria-hidden="true"
                  className={cn(
                    'block h-2 rounded-full',
                    i < solved ? 'bg-bl-ink' : i === current - 1 && !priv.need_code ? 'bg-bl-ink2' : 'bg-[#ECE9E3]',
                  )}
                />
                <span className={cn('truncate text-[11px]', i < solved ? 'font-semibold text-bl-ink' : 'text-bl-ink2')}>{name}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">Шығыс коды</span>
            <div className="flex gap-1.5" aria-label="Шығыс кодының таңбалары">
              {slots.map((c, i) => (
                <span
                  key={i}
                  data-testid="code-slot"
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-[10px] font-mono text-[20px] font-bold',
                    c ? 'border-2 border-bl-ink bg-white text-bl-ink' : 'border border-dashed border-bl-field bg-bl-bg text-bl-ink2',
                  )}
                >
                  {c ?? '?'}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {isPlayer && priv.feedback && !priv.escaped ? (
        <p
          role="status"
          className={cn('m-0 rounded-[14px] px-3.5 py-3 text-[15px] font-semibold', priv.feedback.ok ? 'bg-bl-okbg text-[#14532D]' : 'bg-bl-badbg text-bl-badtext')}
        >
          {feedbackText(priv.feedback, pub.penalty_s)}
        </p>
      ) : null}

      {isPlayer && priv.challenge ? (
        <QuestionPanel
          key={priv.challenge.qid}
          question={priv.challenge}
          canAnswer
          busy={busy}
          tag={`${pub.lock_names[current - 1]} · ${priv.challenge.paragraph}`}
          onAnswer={(option) => void act({ type: 'answer', option })}
        />
      ) : null}

      {isPlayer && priv.need_code ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: 'code', code });
          }}
        >
          <span className="text-base font-semibold">Бес құлып ашық. Шығыс кодын енгізіңіз</span>
          <input
            aria-label="Шығыс коды"
            value={code}
            maxLength={pub.locks}
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="h-[52px] rounded-[14px] border border-bl-field px-3.5 text-center font-mono text-[22px] font-bold tracking-[0.3em]"
          />
          <button
            type="submit"
            disabled={busy || code.length !== pub.locks}
            className="h-[52px] rounded-[14px] border-0 bg-bl-btn text-[15px] font-semibold text-white disabled:opacity-50"
          >
            Есікті ашу
          </button>
        </form>
      ) : null}

      {isPlayer && priv.escaped ? (
        <p role="status" className="m-0 rounded-[14px] bg-bl-okbg px-3.5 py-3 text-[15px] font-semibold text-[#14532D]">
          Сіз бөлмеден шықтыңыз! Уақыт: {formatTime(priv.time_s)} (айыппұлымен)
        </p>
      ) : null}

      <section aria-label="Жарыс" className="flex flex-col gap-1.5 rounded-2xl border border-bl-line bg-white p-3">
        {ordered.map((p) => (
          <div key={p.seat} className={cn('flex items-center justify-between gap-2 text-[14px]', p.left && 'opacity-50')}>
            <span className="flex min-w-0 items-center gap-1.5 font-semibold">
              <i aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }} />
              <span className="truncate">{p.seat === mySeat ? 'Сіз' : p.name}</span>
            </span>
            <span className="whitespace-nowrap tabular-nums text-bl-ink3">
              {p.escaped ? `шықты · ${formatTime(p.time_s)}` : `${p.solved}/${pub.locks} құлып`}
              {p.penalty ? ` · +${p.penalty} с` : ''}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
