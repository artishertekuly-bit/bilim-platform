import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import t from '@/lib/i18n';

type CourseStatus = 'draft' | 'review' | 'published' | 'archived';

type StatusTone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'new'
  | 'active'
  | 'completed'
  | 'important'
  | 'error'
  | 'ai';

type StatusBadgeProps = {
  status?: CourseStatus;
  tone?: StatusTone;
  children?: ReactNode;
  className?: string;
};

const statusConfig: Record<CourseStatus, { label: string; tone: StatusTone }> = {
  draft: {
    label: t('course.status.draft'),
    tone: 'completed',
  },
  review: {
    label: t('course.status.review'),
    tone: 'important',
  },
  published: {
    label: t('course.status.published'),
    tone: 'active',
  },
  archived: {
    label: t('course.status.archived'),
    tone: 'muted',
  },
};

const toneClassName: Record<StatusTone, string> = {
  default: 'border-border bg-card text-muted-foreground',
  muted: 'border-border bg-muted text-muted-foreground',

  primary: 'border-primary-muted bg-primary-soft text-primary',
  secondary: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
  success: 'border-success-muted bg-success-soft text-success-foreground',
  warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
  danger: 'border-destructive-muted bg-destructive-soft text-destructive',

  new: 'border-status-new/70 bg-status-new text-status-new-foreground',
  active: 'border-status-active/70 bg-status-active text-status-active-foreground',
  completed:
    'border-status-completed/70 bg-status-completed text-status-completed-foreground',
  important:
    'border-status-important/70 bg-status-important text-status-important-foreground',
  error: 'border-status-error/70 bg-status-error text-status-error-foreground',

  ai: 'border-ai-border bg-ai-soft text-ai-foreground',
};

export default function StatusBadge({
  status,
  tone,
  children,
  className,
}: StatusBadgeProps) {
  const statusMeta = status ? statusConfig[status] : null;
  const resolvedTone = tone || statusMeta?.tone || 'default';
  const label = children || statusMeta?.label || '';

  if (!label) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide shadow-none',
        'transition-all duration-200 ease-soft',
        toneClassName[resolvedTone],
        className
      )}
    >
      {label}
    </Badge>
  );
}