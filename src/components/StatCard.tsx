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
      icon: 'bg-primary-soft text-primary',
      trend: 'bg-primary-soft text-primary',
    },
    secondary: {
      icon: 'bg-secondary-soft text-secondary-foreground',
      trend: 'bg-secondary-soft text-secondary-foreground',
    },
    accent: {
      icon: 'bg-accent-soft text-accent-foreground',
      trend: 'bg-accent-soft text-accent-foreground',
    },
    success: {
      icon: 'bg-success-soft text-success-foreground',
      trend: 'bg-success-soft text-success-foreground',
    },
    warning: {
      icon: 'bg-warning-soft text-warning-foreground',
      trend: 'bg-warning-soft text-warning-foreground',
    },
    ai: {
      icon: 'bg-ai-soft text-primary',
      trend: 'bg-ai-soft text-primary',
    },
  };

  return map[tone];
}

export default function StatCard({
  label,
  value,
  icon,
  trend,
  tone = 'primary',
  className,
}: StatCardProps) {
  const toneClassName = getToneClassName(tone);

  return (
    <Card
      interactive
      className={cn('overflow-hidden shadow-xs hover:shadow-sm bg-card', className)}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
              toneClassName.icon
            )}
          >
            {icon}
          </div>

          {trend ? (
            <span
              className={cn(
                'inline-flex max-w-[120px] items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none',
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

          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}