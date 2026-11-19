// Емтихан экрандарының ортақ бөліктері. Түстер мен өлшемдер «Bilim — телефон прототипі»
// дизайн-канвасынан алынған: фон #F6F5F2, карта #FFFFFF, жиек #E2E0DB, мәтін #111111.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

export function ExamScreen({ children, footer, header }: { children: ReactNode; footer?: ReactNode; header?: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#F6F5F2] text-[#111111]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
        {header}
        <main className="flex flex-1 flex-col gap-4 px-4 pb-5 pt-3">{children}</main>
        {footer ? (
          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[#E2E0DB] bg-[#F6F5F2] px-4 pb-6 pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function SessionHeader({
  levelLabel,
  answered,
  total,
  onClose,
  timerSeconds,
}: {
  levelLabel: string;
  answered: number;
  total: number;
  onClose: () => void;
  timerSeconds?: number | null;
}) {
  const percent = total ? Math.round((answered / total) * 100) : 0;
  const urgent = timerSeconds !== null && timerSeconds !== undefined && timerSeconds <= 10;
  return (
    <header className="flex items-center gap-2 pb-2 pl-1 pr-4 pt-3">
      <button
        type="button"
        onClick={onClose}
        aria-label="Емтиханнан шығу"
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#111111] hover:bg-[#ECE9E3]"
      >
        <CloseIcon />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-[13px] text-[#5E5E5E]">
          <span className="truncate font-semibold text-[#111111]">{levelLabel}</span>
          <div className="flex items-center gap-2">
            {timerSeconds !== null && timerSeconds !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums',
                  urgent ? 'bg-[#FBEAEA] text-[#B42323]' : 'bg-[#ECE9E3] text-[#111111]',
                )}
              >
                00:{String(Math.max(0, timerSeconds)).padStart(2, '0')}
              </span>
            ) : null}
            <span>
              {Math.min(answered + 1, total)} / {total}
            </span>
          </div>
        </div>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[#E2E0DB]">
          <div className="h-full rounded-full bg-[#111111] transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </header>
  );
}

export function SimpleHeader({ title, to, label = 'Жабу' }: { title: string; to: string; label?: string }) {
  return (
    <header className="flex items-center gap-2 pb-1 pl-1 pr-4 pt-3">
      <Link
        to={to}
        aria-label={label}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#111111] hover:bg-[#ECE9E3]"
      >
        <CloseIcon />
      </Link>
      <span className="text-base font-semibold">{title}</span>
    </header>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'muted' }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'good' && 'bg-[#E6F3EA] text-[#1F6B3F]',
        tone === 'neutral' && 'bg-[#ECE9E3] text-[#4A4A4A]',
        tone === 'muted' && 'bg-[#F1EFEA] text-[#5E5E5E]',
      )}
    >
      {children}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#5E5E5E]">{children}</h2>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-[#E2E0DB] bg-white', className)}>{children}</div>;
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-[52px] w-full rounded-[14px] bg-[#121212] text-base font-semibold text-white transition-colors disabled:cursor-default disabled:bg-[#D9D6D0] disabled:text-[#4A4A4A]"
    >
      {children}
    </button>
  );
}

export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex h-12 items-center justify-center rounded-[14px] border border-[#D9D6D0] bg-white text-[15px] font-semibold text-[#111111] no-underline"
    >
      {children}
    </Link>
  );
}

export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex h-[52px] items-center justify-center rounded-[14px] bg-[#121212] text-base font-semibold text-white no-underline"
    >
      {children}
    </Link>
  );
}

export function Banner({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-[14px] px-4 py-3.5 text-[15px] font-semibold',
        tone === 'good' && 'bg-[#E6F3EA] text-[#14532D]',
        tone === 'bad' && 'bg-[#FBEAEA] text-[#7F1D1D]',
        tone === 'warn' && 'bg-[#FBF1DC] font-medium text-[#5C3A08]',
        tone === 'info' && 'border border-[#E2E0DB] bg-white font-medium text-[#4A4A4A]',
      )}
    >
      {children}
    </div>
  );
}

export function LoadingBlock({ label = 'Жүктелуде…' }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="h-5 w-2/3 animate-pulse rounded-md bg-[#ECE9E3]" />
      <div className="h-14 animate-pulse rounded-2xl bg-[#ECE9E3]" />
      <div className="h-14 animate-pulse rounded-2xl bg-[#ECE9E3]" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
