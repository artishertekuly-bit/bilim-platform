// Ойын экрандарының ортақ бөліктері: таймер, күй баннері, сұрақ парағы, нәтиже, QR (дизайн: ойын артбордтары).
import qrcode from 'qrcode-generator';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { useNow } from '@/components/games/useNow';
import { SEAT_COLORS, secondsLeft } from '@/lib/games-api';
import { cn } from '@/lib/utils';

export interface QuestionView {
  qid: string;
  paragraph: string;
  difficulty: number;
  stem: string;
  options: { id: string; text: string }[];
  to: string[];
  deadline: string;
  answered: string[];
}


export function Countdown({ deadline, label }: { deadline: string | null | undefined; label?: string }) {
  const now = useNow();
  const left = secondsLeft(deadline, now);
  if (left === null) return null;
  const urgent = left <= 5;
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums',
        urgent ? 'bg-bl-badbg text-[#B42323]' : 'bg-bl-soft text-bl-ink',
      )}
      aria-label={`${label ?? 'Уақыт'}: ${left} секунд`}
    >
      {label ? `${label} ` : ''}
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

export function SeatDot({ seat, size = 10 }: { seat: number; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block flex-none rounded-full"
      style={{ width: size, height: size, background: SEAT_COLORS[seat % SEAT_COLORS.length] }}
    />
  );
}

const DIFFICULTY = ['', 'Жеңіл', 'Орташа', 'Қиын'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Ойын күйінің баннері (дизайн: Checkers/SeaBattle/AdisBoard.dc.html): ақ карта, сол жақта қалың жиек. */
export function StatusBanner({ title, hint, accent = '#111111' }: { title: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-0.5 rounded-[14px] border border-bl-line bg-white px-3.5 py-2.5"
      style={{ borderLeft: `6px solid ${accent}` }}
    >
      <span className="text-[15px] font-bold">{title}</span>
      {hint ? <span className="text-[13px] text-bl-ink3">{hint}</span> : null}
    </div>
  );
}

/** Сұрақ (дизайн: ойын артбордтарындағы «Сұрақ» парағы): деңгей белгісі, таймер, A–D нұсқалар, «Бекіту».
 *  `sheet` берілсе, тақтаның үстінен төменгі парақ болып ашылады; әйтпесе бет ішінде карта болып тұрады. */
export function QuestionPanel({
  question,
  canAnswer,
  busy,
  chosen,
  onAnswer,
  note,
  extra,
  tag,
  tagStyle,
  sheet,
  hidden,
}: {
  question: QuestionView;
  canAnswer: boolean;
  busy?: boolean;
  chosen?: string | null;
  onAnswer: (option: string) => void;
  note?: ReactNode;
  extra?: ReactNode;
  tag?: ReactNode;
  tagStyle?: CSSProperties;
  sheet?: boolean;
  /** 50/50 сияқты алынып тасталған нұсқалар. */
  hidden?: string[];
}) {
  const [picked, setPicked] = useState<{ qid: string; option: string } | null>(null);
  const current = picked?.qid === question.qid ? picked.option : null;
  const locked = !canAnswer || Boolean(busy) || Boolean(chosen);
  const selected = chosen ?? current;
  const canConfirm = !locked && current !== null;

  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-bl-soft px-2.5 py-1 text-xs font-bold text-bl-ink3" style={tagStyle}>
          {tag ?? `Сұрақ · ${DIFFICULTY[question.difficulty] ?? ''}`.trim()}
        </span>
        <span className="ml-auto">
          <Countdown deadline={question.deadline} />
        </span>
      </div>
      <p className="m-0 text-[13px] text-bl-ink2">{question.paragraph}</p>
      <h2 className="m-0 text-[19px] font-semibold leading-[1.4]">{question.stem}</h2>
      <div className="flex flex-col gap-2">
        {question.options.map((option, index) => {
          const gone = hidden?.includes(option.id);
          const on = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              autoFocus={sheet && index === 0 && !locked}
              disabled={locked || gone}
              aria-pressed={on}
              onClick={() => setPicked({ qid: question.qid, option: option.id })}
              className={cn(
                'flex min-h-[52px] w-full items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left text-[15px] font-medium text-bl-ink',
                gone
                  ? 'border border-dashed border-bl-handle bg-bl-bg text-[#8A857C] line-through'
                  : on
                    ? 'border-2 border-bl-ink bg-white'
                    : 'border border-bl-line bg-white',
                !locked && !gone && 'hover:border-bl-ink',
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#F1EFEA] text-[13px] font-bold text-bl-ink3"
              >
                {LETTERS[index] ?? index + 1}
              </span>
              <span className="flex-1">{option.text}</span>
            </button>
          );
        })}
      </div>
      {chosen ? (
        <p role="status" className="m-0 rounded-[14px] bg-bl-soft px-3.5 py-3 text-[15px] font-semibold">
          Жауабыңыз қабылданды. Нәтижесін күтіңіз.
        </p>
      ) : canAnswer ? (
        <div className="flex gap-2">
          {extra}
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => current && onAnswer(current)}
            className={cn(
              'h-[52px] flex-1 rounded-[14px] border-0 text-base font-semibold',
              canConfirm ? 'bg-bl-btn text-white' : 'bg-bl-handle text-bl-ink3',
            )}
          >
            {busy ? 'Жіберілуде…' : 'Бекіту'}
          </button>
        </div>
      ) : (
        extra
      )}
      {note ? <p className="m-0 text-sm text-bl-ink2">{note}</p> : null}
    </>
  );

  if (sheet && canAnswer && !chosen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col justify-end bg-[rgba(17,17,17,0.45)]">
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Сұрақ"
          className="mx-auto flex max-h-[88%] w-full max-w-[520px] flex-col gap-3 overflow-y-auto rounded-t-[20px] bg-bl-bg px-4 pb-6 pt-4"
        >
          <span aria-hidden="true" className="h-1 w-10 self-center rounded-full bg-bl-handle" />
          {body}
        </section>
      </div>
    );
  }
  return <section className="flex flex-col gap-3 rounded-2xl border border-bl-line bg-white p-4">{body}</section>;
}

export function LastAnswer({ last }: { last: { ok?: boolean; right_option?: string; timeout?: boolean } | null | undefined }) {
  if (!last || last.ok === undefined) return null;
  return (
    <p
      role="status"
      className={cn(
        'm-0 rounded-[14px] px-3.5 py-3 text-[15px] font-semibold',
        last.ok ? 'bg-bl-okbg text-[#14532D]' : 'bg-bl-badbg text-bl-badtext',
      )}
    >
      {last.ok ? 'Дұрыс жауап!' : last.timeout ? 'Уақыт бітті: жүріс қарсыласқа өтті.' : 'Қате жауап: жүріс қарсыласқа өтті.'}
    </p>
  );
}
export interface ResultRow {
  place: number;
  name: string;
  seat?: number;
  score?: number;
  right_answers?: number;
  cells?: number;
  side?: string;
  bot?: boolean;
}

export function ResultsPanel({ rows, scoreLabel = 'ұпай' }: { rows: ResultRow[]; scoreLabel?: string }) {
  return (
    <div className="flex flex-col divide-y divide-bl-soft rounded-2xl border border-bl-line bg-white">
      {rows.map((row, index) => (
        <div key={`${row.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
          <span className="w-6 text-lg font-bold tabular-nums">{row.place}</span>
          {row.seat !== undefined ? <SeatDot seat={row.seat} /> : null}
          <span className="flex-1 truncate font-semibold">{row.name}</span>
          <span className="text-sm text-[#5E5E5E]">
            {row.score !== undefined ? `${row.score} ${scoreLabel}` : null}
            {row.right_answers !== undefined ? ` · ${row.right_answers} дұрыс` : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// QR-да кіру бетінің сілтемесі (код қана, D46): телефон камерасы бөлмеге бірден апарады.
export function JoinQr({ url, size = 176 }: { url: string; size?: number }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const dark: [number, number][] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) dark.push([row, col]);
      }
    }
    return { count, dark };
  }, [url]);
  const quiet = 2;
  const total = cells.count + quiet * 2;
  return (
    <svg role="img" aria-label="Бөлмеге кіру QR-коды" width={size} height={size} viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges" className="rounded-lg bg-white">
      <rect width={total} height={total} fill="#FFFFFF" />
      {cells.dark.map(([row, col]) => (
        <rect key={`${row}-${col}`} x={col + quiet} y={row + quiet} width={1} height={1} fill="#111111" />
      ))}
    </svg>
  );
}

export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="m-0 rounded-xl bg-[#FBEAEA] px-3 py-2 text-sm font-medium text-[#7F1D1D]">{message}</p>;
}
