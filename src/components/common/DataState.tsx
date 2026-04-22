import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

type Align = 'left' | 'center';

type BaseStateProps = {
  title?: string;
  text?: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  align?: Align;
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
  className,
  align = 'left',
  tone = 'default',
  role,
}: BaseStateProps & {
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'danger';
  role?: 'status' | 'alert';
}) {
  const isCentered = align === 'center';

  return (
    <div
      role={role}
      className={cx(
        'rounded-xl border p-6',
        tone === 'danger' && 'border-destructive/30 bg-destructive/5',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/5',
        tone === 'default' && 'border-border bg-card',
        className
      )}
    >
      <div className={cx('flex gap-4', isCentered && 'flex-col items-center text-center')}>
        <div
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            tone === 'danger' && 'bg-destructive/10 text-destructive',
            tone === 'warning' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            tone === 'default' && 'bg-muted text-muted-foreground'
          )}
        >
          {icon}
        </div>

        <div className={cx('min-w-0 flex-1', isCentered && 'flex flex-col items-center')}>
          {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
          {text ? <p className="mt-1 text-sm text-muted-foreground">{text}</p> : null}
          {hint ? <p className="mt-3 text-xs text-muted-foreground">{hint}</p> : null}
          {action ? <div className="mt-4">{action}</div> : null}
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
};

export function LoadingState({
  title = 'Деректер жүктеліп жатыр',
  text = 'Аз уақыт күтіңіз.',
  hint,
  className,
  align = 'left',
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
    />
  );
}

type ErrorStateProps = {
  title?: string;
  text: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  align?: Align;
};

export function ErrorState({
  title = 'Бетті жүктеу мүмкін болмады',
  text,
  hint = 'Бетті қайта жүктеп көріңіз немесе сәл кейінірек қайталаңыз.',
  action,
  className,
  align = 'left',
}: ErrorStateProps) {
  return (
    <StateCard
      role="alert"
      tone="danger"
      align={align}
      className={className}
      icon={<AlertTriangle size={18} />}
      title={title}
      text={text}
      hint={hint}
      action={action}
    />
  );
}

type EmptyStateProps = {
  title: string;
  text: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  align?: Align;
};

export function EmptyState({
  title,
  text,
  hint,
  action,
  className,
  align = 'center',
}: EmptyStateProps) {
  return (
    <StateCard
      tone="default"
      align={align}
      className={cx('border-dashed', className)}
      icon={<Inbox size={18} />}
      title={title}
      text={text}
      hint={hint}
      action={action}
    />
  );
}