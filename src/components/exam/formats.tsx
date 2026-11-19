// Код форматтарының экрандары (ai_examiner §3.1, D30): сүйреу жоқ, тек түрту және ↑/↓, ± түймелері.
// Әр компонент жауапты өзі жинайды да, толық болғанда `onChange(answer)`, толық емес болса `null` береді.
// `locked` — жауап жіберілгеннен кейін өзгертуге болмайды; `verdict` — 1-сатының нәтижесі.
import { useEffect, useMemo, useState } from 'react';

import type {
  FormulaContent,
  MatchingContent,
  McqContent,
  SliderContent,
  StepsContent,
} from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

import { CheckIcon, CloseIcon } from './ExamUi';

export type Answer = Record<string, unknown>;
type Verdict = 'correct' | 'incorrect' | null;

interface FormatProps<C> {
  content: C;
  locked: boolean;
  verdict: Verdict;
  onChange: (answer: Answer | null) => void;
}

const OPTION = 'flex w-full min-h-14 items-center gap-3 rounded-[14px] px-4 py-3 text-left text-base font-medium';
const IDLE = 'border border-[#E2E0DB] bg-white text-[#111111]';
const SELECTED = 'border-2 border-[#111111] bg-white text-[#111111] shadow-[0_0_0_3px_#DDD5C8]';
const GOOD = 'border-2 border-[#1F7A47] bg-[#E6F3EA] text-[#14532D]';
const BAD = 'border-2 border-[#B42323] bg-[#FBEAEA] text-[#7F1D1D]';
const DIM = 'border border-[#E2E0DB] bg-white text-[#5E5E5E]';

function Stem({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 whitespace-pre-line text-xl font-semibold leading-snug">{text}</h1>
      {hint ? <p className="m-0 text-sm leading-snug text-[#5E5E5E]">{hint}</p> : null}
    </div>
  );
}

function VerdictMark({ verdict }: { verdict: Verdict }) {
  if (verdict === 'correct') {
    return (
      <span className="flex items-center gap-1 text-[13px] font-bold">
        <CheckIcon /> Дұрыс
      </span>
    );
  }
  if (verdict === 'incorrect') {
    return (
      <span className="flex items-center gap-1 text-[13px] font-bold">
        <CloseIcon /> Қате
      </span>
    );
  }
  return null;
}

// --------------------------------------------------------------------- 8 · Тест

export function McqTask({ content, locked, verdict, onChange }: FormatProps<McqContent>) {
  const [picked, setPicked] = useState<string | null>(null);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return (
    <>
      <Stem text={content.stem} />
      <div className="flex flex-col gap-2.5">
        {content.options.map((option, index) => {
          const chosen = picked === option.id;
          const style = locked
            ? chosen
              ? verdict === 'correct'
                ? GOOD
                : verdict === 'incorrect'
                  ? BAD
                  : SELECTED
              : DIM
            : chosen
              ? SELECTED
              : IDLE;
          return (
            <button
              key={option.id}
              type="button"
              disabled={locked}
              aria-pressed={chosen}
              onClick={() => {
                setPicked(option.id);
                onChange({ option_id: option.id });
              }}
              className={cn(OPTION, style)}
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F1EFEA] text-[13px] font-bold text-[#4A4A4A]"
              >
                {letters[index]}
              </span>
              <span className="flex-1">{option.text}</span>
              {locked && chosen ? <VerdictMark verdict={verdict} /> : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- I-1 · Сәйкестендіру

export function MatchingTask({ content, locked, onChange }: FormatProps<MatchingContent>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const owner = useMemo(() => Object.fromEntries(Object.entries(pairs).map(([l, r]) => [r, l])), [pairs]);
  const number = (leftId: string) => content.left.findIndex((item) => item.id === leftId) + 1;

  useEffect(() => {
    const complete = Object.keys(pairs).length === content.left.length;
    onChange(complete ? { pairs: Object.entries(pairs).map(([left_id, right_id]) => ({ left_id, right_id })) } : null);
  }, [pairs, content.left.length, onChange]);

  const tapLeft = (id: string) => {
    if (locked) return;
    if (pairs[id]) {
      const next = { ...pairs };
      delete next[id];
      setPairs(next);
      setSelected(id);
      return;
    }
    setSelected(selected === id ? null : id);
  };

  const tapRight = (id: string) => {
    if (locked) return;
    if (selected) {
      const next = Object.fromEntries(Object.entries(pairs).filter(([, r]) => r !== id));
      next[selected] = id;
      setPairs(next);
      setSelected(null);
      return;
    }
    if (owner[id]) {
      const next = { ...pairs };
      delete next[owner[id]];
      setPairs(next);
    }
  };

  const cell = 'flex w-full min-h-14 items-center gap-2 rounded-[14px] px-3 py-2.5 text-left text-[15px] leading-snug font-medium text-[#111111]';
  const badge = (n: number) => (
    <span
      aria-label={`Жұп ${n}`}
      className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[#111111] text-[13px] font-bold text-white"
    >
      {n}
    </span>
  );

  return (
    <>
      <Stem
        text={content.stem}
        hint="Алдымен сол жақтан элементті, содан кейін оң жақтан оның жұбын түртіңіз. Жұпты ажырату үшін қайта түртіңіз."
      />
      <div className="grid grid-cols-2 gap-2.5">
        {content.left.map((item, idx) => {
          const right = content.right[idx];
          return (
            <div key={item.id} className="contents">
              <button
                type="button"
                disabled={locked}
                aria-pressed={selected === item.id}
                onClick={() => tapLeft(item.id)}
                className={cn(
                  cell,
                  selected === item.id
                    ? 'border-2 border-[#111111] bg-white shadow-[0_0_0_3px_#DDD5C8]'
                    : pairs[item.id]
                      ? 'border border-[#CFCBC3] bg-[#EFECE6]'
                      : 'border border-[#E2E0DB] bg-white',
                )}
              >
                <span className="flex-1 break-words">{item.text}</span>
                {pairs[item.id] ? badge(number(item.id)) : null}
              </button>
              {right ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => tapRight(right.id)}
                  className={cn(
                    cell,
                    owner[right.id]
                      ? 'border border-[#CFCBC3] bg-[#EFECE6]'
                      : selected
                        ? 'border border-dashed border-[#8C877E] bg-white'
                        : 'border border-[#E2E0DB] bg-white',
                  )}
                >
                  {owner[right.id] ? badge(number(owner[right.id])) : null}
                  <span className="flex-1 break-words">{right.text}</span>
                </button>
              ) : <div />}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span role="status" className="text-sm text-[#5E5E5E]">
          Жұпталды: {Object.keys(pairs).length} / {content.left.length}
        </span>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setPairs({});
            setSelected(null);
          }}
          className="h-11 px-3 text-sm font-semibold text-[#111111] disabled:text-[#B5B0A7]"
        >
          Тазалау
        </button>
      </div>
    </>
  );
}

// --------------------------------------------------------------------- 6 · Реттілік

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

export function SequenceTask({ content, locked, onChange }: FormatProps<StepsContent>) {
  const [order, setOrder] = useState<string[]>(() => content.steps.map((step) => step.id));
  const text = useMemo(() => Object.fromEntries(content.steps.map((s) => [s.id, s.text])), [content.steps]);

  useEffect(() => {
    onChange({ order });
  }, [order, onChange]);

  const move = (from: number, to: number) => {
    const next = order.slice();
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
  };
  const arrow = 'flex h-10 w-11 items-center justify-center rounded-[10px]';
  const on = 'border border-[#CFCBC3] bg-[#F6F5F2] text-[#111111]';
  const off = 'border border-[#ECE9E3] bg-white text-[#B5B0A7]';

  return (
    <>
      <Stem text={content.stem} hint="Әр қадамды көрсеткілермен жоғары не төмен жылжытыңыз." />
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {order.map((id, index) => (
          <li key={id} className="flex items-center gap-2.5 rounded-[14px] border border-[#E2E0DB] bg-white py-2 pl-3 pr-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#111111] text-sm font-bold text-white"
            >
              {index + 1}
            </span>
            <span className="flex-1 text-[15px] leading-snug">{text[id]}</span>
            <span className="flex flex-none flex-col gap-1">
              <button
                type="button"
                aria-label={`Жоғары жылжыту: ${text[id]}`}
                disabled={locked || index === 0}
                onClick={() => move(index, index - 1)}
                className={cn(arrow, locked || index === 0 ? off : on)}
              >
                <Arrow up />
              </button>
              <button
                type="button"
                aria-label={`Төмен жылжыту: ${text[id]}`}
                disabled={locked || index === order.length - 1}
                onClick={() => move(index, index + 1)}
                className={cn(arrow, locked || index === order.length - 1 ? off : on)}
              >
                <Arrow up={false} />
              </button>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

// --------------------------------------------------------------------- I-2 (Ә) · Қате қадам

export function ErrorStepTask({ content, locked, verdict, onChange }: FormatProps<StepsContent>) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <Stem text={content.stem} hint="Пайымдаудағы қате қадамды түртіп белгілеңіз." />
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {content.steps.map((step, index) => {
          const chosen = picked === step.id;
          const style = locked
            ? chosen
              ? verdict === 'correct'
                ? GOOD
                : verdict === 'incorrect'
                  ? BAD
                  : SELECTED
              : DIM
            : chosen
              ? SELECTED
              : IDLE;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={locked}
                aria-pressed={chosen}
                onClick={() => {
                  setPicked(step.id);
                  onChange({ step_id: step.id });
                }}
                className={cn(OPTION, 'text-[15px]', style)}
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F1EFEA] text-[13px] font-bold text-[#4A4A4A]"
                >
                  {index + 1}
                </span>
                <span className="flex-1 leading-snug">{step.text}</span>
                {locked && chosen ? <VerdictMark verdict={verdict} /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// --------------------------------------------------------------------- I-3 (Б) · Формула конструкторы

export function FormulaTask({ content, locked, onChange }: FormatProps<FormulaContent>) {
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const label = useMemo(() => Object.fromEntries(content.tokens.map((t) => [t.id, t.label])), [content.tokens]);
  const used = new Set(Object.values(placement));
  const numerator = content.slots.filter((s) => s.position === 'numerator');
  const denominator = content.slots.filter((s) => s.position === 'denominator');

  useEffect(() => {
    onChange(Object.keys(placement).length === content.slots.length ? { placement } : null);
  }, [placement, content.slots.length, onChange]);

  const place = (tokenId: string) => {
    if (locked || used.has(tokenId)) return;
    const free = content.slots.find((slot) => !placement[slot.id]);
    if (free) setPlacement({ ...placement, [free.id]: tokenId });
  };
  const clear = (slotId: string) => {
    if (locked || !placement[slotId]) return;
    const next = { ...placement };
    delete next[slotId];
    setPlacement(next);
  };
  const slotView = (slotId: string) => (
    <button
      key={slotId}
      type="button"
      disabled={locked}
      onClick={() => clear(slotId)}
      aria-label={placement[slotId] ? `Орынды босату: ${label[placement[slotId]]}` : 'Бос орын'}
      className={cn(
        'flex h-12 min-w-14 items-center justify-center rounded-xl px-3 text-lg font-semibold',
        placement[slotId] ? 'border border-[#CFCBC3] bg-[#EFECE6]' : 'border border-dashed border-[#8C877E] bg-white text-[#B5B0A7]',
      )}
    >
      {placement[slotId] ? label[placement[slotId]] : '?'}
    </button>
  );

  return (
    <>
      <Stem text={content.stem} hint="Шаманы түртсеңіз, ол келесі бос орынға түседі. Орынды түртсеңіз, ол босайды." />
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#E2E0DB] bg-white px-4 py-6">
        <span className="text-2xl font-semibold">{content.result} =</span>
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">{numerator.map((slot) => slotView(slot.id))}</div>
          {denominator.length ? (
            <>
              <div aria-hidden="true" className="h-0.5 w-full min-w-24 bg-[#111111]" />
              <div className="flex gap-2">{denominator.map((slot) => slotView(slot.id))}</div>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {content.tokens.map((token) => (
          <button
            key={token.id}
            type="button"
            disabled={locked || used.has(token.id)}
            onClick={() => place(token.id)}
            className="h-12 min-w-14 rounded-xl border border-[#E2E0DB] bg-white px-4 text-lg font-semibold disabled:opacity-40"
          >
            {token.label}
          </button>
        ))}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- I-4 (Г) · Слайдер

function decimals(step: number): number {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

export function SliderTask({ content, locked, onChange }: FormatProps<SliderContent>) {
  const { input, output } = content;
  const [value, setValue] = useState<number>(() => input.min);
  const digits = decimals(input.step);

  useEffect(() => {
    onChange({ value: Number(value.toFixed(digits)) });
  }, [value, digits, onChange]);

  const set = (next: number) => setValue(Math.min(input.max, Math.max(input.min, Number(next.toFixed(digits)))));
  const pm = 'flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-[#CFCBC3] bg-[#F6F5F2] text-2xl font-semibold disabled:opacity-40';

  return (
    <>
      <Stem text={content.stem} />
      <div className="flex flex-col gap-4 rounded-2xl border border-[#E2E0DB] bg-white p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[#5E5E5E]">{input.name}</span>
          <span className="text-2xl font-bold">
            {value.toFixed(digits)} {input.unit}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Азайту" disabled={locked || value <= input.min} onClick={() => set(value - input.step)} className={pm}>
            −
          </button>
          <input
            type="range"
            aria-label={input.name}
            min={input.min}
            max={input.max}
            step={input.step}
            value={value}
            disabled={locked}
            onChange={(event) => set(Number(event.target.value))}
            className="h-2 flex-1 accent-[#111111]"
          />
          <button type="button" aria-label="Көбейту" disabled={locked || value >= input.max} onClick={() => set(value + input.step)} className={pm}>
            +
          </button>
        </div>
        <div className="flex items-baseline justify-between border-t border-[#ECE9E3] pt-3 text-sm">
          <span className="text-[#5E5E5E]">
            {output.name}, {output.unit}
          </span>
          <span className="font-semibold">{output.formula}</span>
        </div>
      </div>
    </>
  );
}
