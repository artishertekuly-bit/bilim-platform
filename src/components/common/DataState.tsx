import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

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

function getToneClasses(tone: StateTone) {
  const map: Record<
    StateTone,
    {
      card: string;
      icon: string;
      glow: string;
      badge: string;
      badgeLabel: string;
    }
  > = {
    default: {
      card: 'border-border bg-card text-card-foreground shadow-soft',
      icon: 'border-border bg-muted text-muted-foreground',
      glow: 'bg-surface-soft/70',
      badge: 'border-border bg-muted text-muted-foreground',
      badgeLabel: '',
    },
    success: {
      card: 'border-success-muted bg-success-soft/70 text-success-foreground shadow-soft',
      icon: 'border-success-muted bg-card/80 text-success-foreground',
      glow: 'bg-success-muted/30',
      badge: 'border-success-muted bg-success-soft text-success-foreground',
      badgeLabel: 'Дайын',
    },
    warning: {
      card: 'border-warning-muted bg-warning-soft/70 text-warning-foreground shadow-soft',
      icon: 'border-warning-muted bg-card/80 text-warning-foreground',
      glow: 'bg-warning-muted/30',
      badge: 'border-warning-muted bg-warning-soft text-warning-foreground',
      badgeLabel: 'Ескерту',
    },
    danger: {
      card: 'border-destructive-muted bg-destructive-soft/70 text-destructive shadow-soft',
      icon: 'border-destructive-muted bg-card/80 text-destructive',
      glow: 'bg-destructive-muted/30',
      badge: 'border-destructive-muted bg-destructive-soft text-destructive',
      badgeLabel: 'Қате',
    },
    ai: {
      card: 'border-ai-border bg-ai-soft/80 text-ai-foreground shadow-soft',
      icon: 'border-ai-border bg-card/80 text-primary',
      glow: 'bg-primary-soft/70',
      badge: 'border-ai-border bg-ai-soft text-primary',
      badgeLabel: 'AI',
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

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : role === 'status' ? 'polite' : undefined}
      aria-busy={ariaBusy}
      className={cn(
        'relative overflow-hidden rounded-3xl border transition-all duration-200 ease-soft',
        isSmall ? 'p-4' : 'p-5 sm:p-6',
        toneClasses.card,
        className
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl',
          toneClasses.glow
        )}
      />

      {tone === 'ai' ? (
        <div className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-secondary-soft/60 blur-3xl" />
      ) : null}

      <div
        className={cn(
          'relative flex gap-4',
          isCentered && 'flex-col items-center text-center',
          isSmall && 'gap-3'
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            isSmall ? 'h-10 w-10' : 'h-11 w-11',
            toneClasses.icon
          )}
        >
          {icon}
        </div>

        <div className={cn('min-w-0 flex-1', isCentered && 'flex flex-col items-center')}>
          {title ? (
            <div
              className={cn(
                'flex flex-wrap items-center gap-2',
                isCentered && 'justify-center'
              )}
            >
              <p
                className={cn(
                  'font-semibold text-foreground',
                  isSmall ? 'text-sm' : 'text-base'
                )}
              >
                {title}
              </p>

              {tone !== 'default' ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                    toneClasses.badge
                  )}
                >
                  {toneClasses.badgeLabel}
                </span>
              ) : null}
            </div>
          ) : null}

          {text ? (
            <p
              className={cn(
                'mt-1 text-muted-foreground',
                isSmall ? 'text-xs leading-5' : 'max-w-2xl text-sm leading-6'
              )}
            >
              {text}
            </p>
          ) : null}

          {hint ? (
            <p className="mt-3 max-w-2xl rounded-2xl border border-border bg-card/65 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {hint}
            </p>
          ) : null}

          {action || secondaryAction ? (
            <div
              className={cn(
                'mt-4 flex flex-wrap gap-2',
                isCentered ? 'justify-center' : 'justify-start'
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
  title = 'Деректер жүктеліп жатыр',
  text = 'Аз уақыт күтіңіз.',
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
  title = 'Бетті жүктеу мүмкін болмады',
  text,
  hint = 'Бетті қайта жүктеп көріңіз немесе сәл кейінірек қайталаңыз.',
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