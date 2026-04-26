import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  size?: 'sm' | 'md';
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'ai';
  className?: string;
}

function clampPercent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return Math.min(Math.max(Math.round((value / max) * 100), 0), 100);
}

function getToneClassName(tone: NonNullable<ProgressBarProps['tone']>) {
  const map = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    ai: 'bg-ai',
  };

  return map[tone];
}

export default function ProgressBar({
  value,
  max = 100,
  label,
  showPercent = true,
  size = 'md',
  tone = 'primary',
  className,
}: ProgressBarProps) {
  const percent = clampPercent(value, max);

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) ? (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {label ? (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {label}
            </span>
          ) : (
            <span />
          )}

          {showPercent ? (
            <span className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground">
              {percent}%
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          'overflow-hidden rounded-full border border-border bg-muted shadow-inner-soft',
          size === 'sm' ? 'h-2' : 'h-2.5'
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(Math.max(value, 0), max)}
        aria-label={label || 'Progress'}
      >
        <div
          className={cn(
            'h-full rounded-full progress-fill',
            getToneClassName(tone)
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}