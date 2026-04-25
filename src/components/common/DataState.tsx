import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

type Align = 'left' | 'center';
type StateTone = 'default' | 'warning' | 'danger';
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

  return (
    <div
      role={role}
      className={cx(
        'rounded-xl border',
        isSmall ? 'p-4' : 'p-6',
        tone === 'danger' && 'border-destructive/30 bg-destructive/5',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/5',
        tone === 'default' && 'border-border bg-card',
        className
      )}
    >
      <div
        className={cx(
          'flex gap-4',
          isCentered && 'flex-col items-center text-center',
          isSmall && 'gap-3'
        )}
      >
        <div
          className={cx(
            'flex shrink-0 items-center justify-center rounded-full',
            isSmall ? 'h-9 w-9' : 'h-10 w-10',
            tone === 'danger' && 'bg-destructive/10 text-destructive',
            tone === 'warning' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            tone === 'default' && 'bg-muted text-muted-foreground'
          )}
        >
          {icon}
        </div>

        <div className={cx('min-w-0 flex-1', isCentered && 'flex flex-col items-center')}>
          {title ? (
            <p className={cx('font-semibold text-foreground', isSmall ? 'text-sm' : 'text-sm')}>
              {title}
            </p>
          ) : null}

          {text ? (
            <p
              className={cx(
                'mt-1 text-muted-foreground',
                isSmall ? 'text-xs leading-5' : 'text-sm leading-6'
              )}
            >
              {text}
            </p>
          ) : null}

          {hint ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
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
      icon={<Loader2 size={18} className="animate-spin" />}
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
}: EmptyStateProps) {
  return (
    <StateCard
      tone="default"
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