import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatCardTone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'ai';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  trend?: string;
  tone?: StatCardTone;
  className?: string;
}

function getToneClassName(tone: StatCardTone) {
  const map: Record<
    StatCardTone,
    {
      icon: string;
      trend: string;
    }
  > = {
    primary: {
      icon: 'border-primary-muted bg-primary-soft text-primary',
      trend: 'border-primary-muted bg-primary-soft text-primary',
    },
    secondary: {
      icon: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
      trend: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
    },
    accent: {
      icon: 'border-accent-muted bg-accent-soft text-accent-foreground',
      trend: 'border-accent-muted bg-accent-soft text-accent-foreground',
    },
    success: {
      icon: 'border-success-muted bg-success-soft text-success-foreground',
      trend: 'border-success-muted bg-success-soft text-success-foreground',
    },
    warning: {
      icon: 'border-warning-muted bg-warning-soft text-warning-foreground',
      trend: 'border-warning-muted bg-warning-soft text-warning-foreground',
    },
    ai: {
      icon: 'border-ai-border bg-ai-soft text-primary',
      trend: 'border-ai-border bg-ai-soft text-primary',
    },
  };

  return map[tone];
}

export default function StatCard({
  label,
  value,
  icon,
  subtitle,
  trend,
  tone = 'primary',
  className,
}: StatCardProps) {
  const toneClassName = getToneClassName(tone);

  return (
    <Card
      interactive
      className={cn('overflow-hidden border-border bg-card', className)}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
              toneClassName.icon
            )}
          >
            {icon}
          </div>

          {trend ? (
            <span
              className={cn(
                'inline-flex max-w-[120px] items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
                toneClassName.trend
              )}
            >
              <span className="truncate">{trend}</span>
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="truncate text-2xl font-bold tracking-tight text-foreground">
            {value}
          </p>

          <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground">
            {label}
          </p>

          {subtitle ? (
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}