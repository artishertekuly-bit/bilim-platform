// Ойын экрандарының ортақ бөліктері: таймер, сұрақ, нәтиже, QR. Түстер Examiner экрандарымен бірдей (ExamUi).
import qrcode from 'qrcode-generator';
import { useMemo, type ReactNode } from 'react';

import { Card } from '@/components/exam/ExamUi';
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
        urgent ? 'bg-[#FBEAEA] text-[#B42323]' : 'bg-[#ECE9E3] text-[#111111]',
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

export function QuestionPanel({
  question,
  canAnswer,
  busy,
  chosen,
  onAnswer,
  note,
  extra,
}: {
  question: QuestionView;
  canAnswer: boolean;
  busy?: boolean;
  chosen?: string | null;
  onAnswer: (option: string) => void;
  note?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-[#5E5E5E]">
        <span className="truncate">
          {question.paragraph} · {DIFFICULTY[question.difficulty] ?? ''}
        </span>
        <Countdown deadline={question.deadline} />
      </div>
      <p className="m-0 text-[17px] font-semibold leading-snug">{question.stem}</p>
      <div className="flex flex-col gap-2">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={!canAnswer || busy || Boolean(chosen)}
            onClick={() => onAnswer(option.id)}
            className={cn(
              'min-h-[48px] rounded-[14px] border px-4 py-2.5 text-left text-[15px] font-medium transition-colors',
              chosen === option.id ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#D9D6D0] bg-white',
              canAnswer && !chosen ? 'hover:border-[#111111]' : 'cursor-default',
            )}
          >
            {option.text}
          </button>
        ))}
      </div>
      {extra}
      {note ? <p className="m-0 text-sm text-[#5E5E5E]">{note}</p> : null}
    </Card>
  );
}

export function LastAnswer({ last }: { last: { ok?: boolean; right_option?: string; timeout?: boolean } | null | undefined }) {
  if (!last || last.ok === undefined) return null;
  return (
    <p className={cn('m-0 text-sm font-semibold', last.ok ? 'text-[#1F6B3F]' : 'text-[#B42323]')}>
      {last.ok ? 'Дұрыс жауап!' : last.timeout ? 'Уақыт бітті.' : 'Қате жауап.'}
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
    <Card className="flex flex-col divide-y divide-[#ECE9E3]">
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
    </Card>
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
