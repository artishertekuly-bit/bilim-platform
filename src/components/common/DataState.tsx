import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

type Align = 'left' | 'center';
type StateTone = 'default' | 'warning' | 'danger' | 'ai';
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
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
      card: 'border-border bg-card text-card-foreground shadow-soft',
      icon: 'border-border bg-muted text-muted-foreground',
    },
    warning: {
      card: 'border-warning-muted bg-warning-soft text-warning-foreground shadow-soft',
      icon: 'border-warning-muted bg-card/75 text-warning-foreground',
    },
    danger: {
      card: 'border-destructive-muted bg-destructive-soft text-destructive shadow-soft',
      icon: 'border-destructive-muted bg-card/75 text-destructive',
    },
    ai: {
      card: 'border-ai-border bg-ai-soft text-ai-foreground shadow-soft',
      icon: 'border-ai-border bg-card/75 text-primary',
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
}: BaseStateProps & {
  icon: ReactNode;
  tone?: StateTone;
  role?: 'status' | 'alert';
}) {
  const isCentered = align === 'center';
  const isSmall = size === 'sm' || compact;
  const toneClasses = getToneClasses(tone);

  return (
    <div
      role={role}
      className={cx(
        'relative overflow-hidden rounded-3xl border transition-all duration-200 ease-soft',
        isSmall ? 'p-4' : 'p-5 sm:p-6',
        toneClasses.card,
        className
      )}
    >
      <div
        className={cx(
          'pointer-events-none absolute inset-0 opacity-60',
          tone === 'ai' && 'bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary-soft)/0.8),transparent_34%),radial-gradient(circle_at_100%_15%,hsl(var(--secondary-soft)/0.65),transparent_32%)]',
          tone === 'default' && 'bg-[radial-gradient(circle_at_100%_0%,hsl(var(--surface-soft)/0.72),transparent_30%)]',
          tone === 'warning' && 'bg-[radial-gradient(circle_at_100%_0%,hsl(var(--accent-muted)/0.45),transparent_30%)]',
          tone === 'danger' && 'bg-[radial-gradient(circle_at_100%_0%,hsl(var(--destructive-muted)/0.40),transparent_30%)]'
        )}
      />

      <div
        className={cx(
          'relative flex gap-4',
          isCentered && 'flex-col items-center text-center',
          isSmall && 'gap-3'
        )}
      >
        <div
          className={cx(
            'flex shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            isSmall ? 'h-10 w-10' : 'h-11 w-11',
            toneClasses.icon
          )}
        >
          {icon}
        </div>

        <div className={cx('min-w-0 flex-1', isCentered && 'flex flex-col items-center')}>
          {title ? (
            <p className={cx('font-semibold text-foreground', isSmall ? 'text-sm' : 'text-base')}>
              {title}
            </p>
          ) : null}

          {text ? (
            <p
              className={cx(
                'mt-1 text-muted-foreground',
                isSmall ? 'text-xs leading-5' : 'max-w-2xl text-sm leading-6'
              )}
            >
              {text}
            </p>
          ) : null}

          {hint ? (
            <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">
              {hint}
            </p>
          ) : null}

          {action || secondaryAction ? (
            <div
              className={cx(
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
      className={cx('border-dashed', className)}
      icon={icon || <Inbox size={18} />}
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