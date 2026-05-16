import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';

import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type Align = 'left' | 'center';
type StateTone = 'default' | 'success' | 'warning' | 'danger' | 'ai';
type StateSize = 'sm' | 'md';

type BaseStateProps = {
  title?: string;
  text?: string;
  hint?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
  className?: string;
  align?: Align;
  compact?: boolean;
  size?: StateSize;
};

const MAX_TITLE_CHARS = 160;
const MAX_TEXT_CHARS = 700;
const MAX_HINT_CHARS = 700;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TEXT_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function getToneClasses(tone: StateTone) {
  const map: Record<
    StateTone,
    {
      card: string;
      icon: string;
    }
  > = {
    default: {
      card: 'border-border bg-card text-card-foreground',
      icon: 'border-border bg-muted text-muted-foreground',
    },
    success: {
      card: 'border-success-muted bg-success-soft/55 text-success-foreground',
      icon: 'border-success-muted bg-card text-success-foreground',
    },
    warning: {
      card: 'border-warning-muted bg-warning-soft/55 text-warning-foreground',
      icon: 'border-warning-muted bg-card text-warning-foreground',
    },
    danger: {
      card: 'border-destructive-muted bg-destructive-soft/55 text-destructive',
      icon: 'border-destructive-muted bg-card text-destructive',
    },
    ai: {
      card: 'border-ai-border bg-ai-soft/55 text-ai-foreground',
      icon: 'border-ai-border bg-card text-primary',
    },
  };

  return map[tone];
}

function StateCard({
  icon,
  title,
  text,
  hint,
  action,
  secondaryAction,
  className,
  align = 'left',
  tone = 'default',
  role,
  compact = false,
  size = 'md',
  ariaBusy,
}: BaseStateProps & {
  icon: ReactNode;
  tone?: StateTone;
  role?: 'status' | 'alert';
  ariaBusy?: boolean;
}) {
  const isCentered = align === 'center';
  const isSmall = size === 'sm' || compact;
  const toneClasses = getToneClasses(tone);

  const safeTitle = cleanText(title, MAX_TITLE_CHARS);
  const safeText = cleanText(text, MAX_TEXT_CHARS);
  const safeHint = cleanText(hint, MAX_HINT_CHARS);

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : role === 'status' ? 'polite' : undefined}
      aria-busy={ariaBusy || undefined}
      className={cn(
        'rounded-3xl border',
        isSmall ? 'p-4' : 'p-5 sm:p-6',
        toneClasses.card,
        className,
      )}
    >
      <div
        className={cn(
          'flex gap-4',
          isCentered && 'flex-col items-center text-center',
          isSmall && 'gap-3',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl border',
            isSmall ? 'h-10 w-10' : 'h-11 w-11',
            toneClasses.icon,
          )}
        >
          {icon}
        </div>

        <div className={cn('min-w-0 flex-1', isCentered && 'flex flex-col items-center')}>
          {safeTitle ? (
            <p
              className={cn(
                'font-semibold text-foreground',
                isSmall ? 'text-sm' : 'text-base',
              )}
            >
              {safeTitle}
            </p>
          ) : null}

          {safeText ? (
            <p
              className={cn(
                'mt-1 text-muted-foreground',
                isSmall ? 'text-xs leading-5' : 'max-w-2xl text-sm leading-6',
              )}
            >
              {safeText}
            </p>
          ) : null}

          {safeHint ? (
            <p className="mt-3 max-w-2xl rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
              {safeHint}
            </p>
          ) : null}

          {action || secondaryAction ? (
            <div
              className={cn(
                'mt-4 flex flex-wrap gap-2',
                isCentered ? 'justify-center' : 'justify-start',
              )}
            >
              {action}
              {secondaryAction}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type LoadingStateProps = {
  title?: string;
  text?: string;
  hint?: string;
  className?: string;
  align?: Align;
  compact?: boolean;
  size?: StateSize;
};

export function LoadingState({
  title = 'Жүктелуде',
  text,
  hint,
  className,
  align = 'left',
  compact = false,
  size = 'md',
}: LoadingStateProps) {
  return (
    <StateCard
      role="status"
      ariaBusy
      tone="default"
      align={align}
      className={className}
      icon={<Loader2 size={18} className="animate-spin text-primary" />}
      title={title}
      text={text}
      hint={hint}
      compact={compact}
      size={size}
    />
  );
}

type ErrorStateProps = {
  title?: string;
  text: string;
  hint?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
  className?: string;
  align?: Align;
  compact?: boolean;
  size?: StateSize;
};

export function ErrorState({
  title = 'Жүктеу мүмкін болмады',
  text,
  hint,
  action,
  secondaryAction,
  icon,
  className,
  align = 'left',
  compact = false,
  size = 'md',
}: ErrorStateProps) {
  return (
    <StateCard
      role="alert"
      tone="danger"
      align={align}
      className={className}
      icon={icon || <AlertTriangle size={18} />}
      title={title}
      text={text}
      hint={hint}
      action={action}
      secondaryAction={secondaryAction}
      compact={compact}
      size={size}
    />
  );
}

type EmptyStateProps = {
  title: string;
  text: string;
  hint?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
  className?: string;
  align?: Align;
  compact?: boolean;
  size?: StateSize;
  tone?: StateTone;
};

export function EmptyState({
  title,
  text,
  hint,
  action,
  secondaryAction,
  icon,
  className,
  align = 'center',
  compact = false,
  size = 'md',
  tone = 'default',
}: EmptyStateProps) {
  return (
    <StateCard
      tone={tone}
      align={align}
      className={cn('border-dashed', className)}
      icon={icon || (tone === 'success' ? <CheckCircle2 size={18} /> : <Inbox size={18} />)}
      title={title}
      text={text}
      hint={hint}
      action={action}
      secondaryAction={secondaryAction}
      compact={compact}
      size={size}
    />
  );
}