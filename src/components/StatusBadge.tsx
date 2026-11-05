import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import t from '@/lib/i18n';

type CourseStatus = 'draft' | 'review' | 'published' | 'archived';

type CourseAccessType =
  | 'public_free'
  | 'private_invite'
  | 'paid'
  | 'subscription_only'
  | 'school_only'
  | string
  | null
  | undefined;

type OrderStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'paid'
  | 'completed'
  | string;

type LessonStatus =
  | 'available'
  | 'current'
  | 'completed'
  | 'locked'
  | 'draft'
  | string;

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

function normalizeAccessType(accessType: CourseAccessType) {
  const value = String(accessType || '').trim();

  if (value === 'subscription_only') return 'paid';
  if (value === 'school_only') return 'private_invite';

  return value;
}

function getAccessMeta(accessType: CourseAccessType): {
  label: string;
  tone: StatusTone;
} {
  const normalized = normalizeAccessType(accessType);

  switch (normalized) {
    case 'public_free':
    case 'open':
    case 'free':
    case 'public':
      return {
        label: 'Ашық',
        tone: 'success',
      };

    case 'paid':
    case 'premium':
      return {
        label: 'Ақылы',
        tone: 'important',
      };

    case 'private_invite':
    case 'private':
    case 'closed':
    case 'invite_only':
    case 'invite-only':
      return {
        label: 'Жабық',
        tone: 'primary',
      };

    default:
      return {
        label: 'Белгісіз',
        tone: 'muted',
      };
  }
}

function getOrderMeta(status: OrderStatus): {
  label: string;
  tone: StatusTone;
} {
  const normalized = String(status || '').trim().toLowerCase();

  switch (normalized) {
    case 'pending':
      return {
        label: 'Қаралуда',
        tone: 'important',
      };

    case 'approved':
    case 'paid':
    case 'completed':
      return {
        label: 'Расталды',
        tone: 'success',
      };

    case 'rejected':
      return {
        label: 'Қабылданбады',
        tone: 'danger',
      };

    case 'cancelled':
    case 'canceled':
      return {
        label: 'Болдырылмады',
        tone: 'muted',
      };

    default:
      return {
        label: normalized || 'Белгісіз',
        tone: 'muted',
      };
  }
}

function getLessonMeta(status: LessonStatus): {
  label: string;
  tone: StatusTone;
} {
  const normalized = String(status || '').trim().toLowerCase();

  switch (normalized) {
    case 'completed':
      return {
        label: 'Аяқталған',
        tone: 'success',
      };

    case 'current':
      return {
        label: 'Келесі сабақ',
        tone: 'primary',
      };

    case 'locked':
      return {
        label: 'Жабық',
        tone: 'muted',
      };

    case 'draft':
      return {
        label: 'Черновик',
        tone: 'completed',
      };

    case 'available':
      return {
        label: 'Ашық',
        tone: 'secondary',
      };

    default:
      return {
        label: normalized || 'Белгісіз',
        tone: 'muted',
      };
  }
}

function BaseStatusBadge({
  tone = 'default',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none',
        toneClassName[tone],
        className
      )}
    >
      {children}
    </Badge>
  );
}

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
    <BaseStatusBadge tone={resolvedTone} className={className}>
      {label}
    </BaseStatusBadge>
  );
}

export function CourseStatusBadge({
  status,
  className,
}: {
  status: CourseStatus;
  className?: string;
}) {
  const config = statusConfig[status] || {
    label: String(status || 'Белгісіз'),
    tone: 'muted' as StatusTone,
  };

  return (
    <BaseStatusBadge tone={config.tone} className={className}>
      {config.label}
    </BaseStatusBadge>
  );
}

export function CourseAccessBadge(_props: {
  accessType: CourseAccessType;
  className?: string;
}) {
  return null;
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const config = getOrderMeta(status);

  return (
    <BaseStatusBadge tone={config.tone} className={className}>
      {config.label}
    </BaseStatusBadge>
  );
}

export function LessonStatusBadge({
  status,
  className,
}: {
  status: LessonStatus;
  className?: string;
}) {
  const config = getLessonMeta(status);

  return (
    <BaseStatusBadge tone={config.tone} className={className}>
      {config.label}
    </BaseStatusBadge>
  );
}