import type { ReactNode } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type CourseStatus = 'draft' | 'review' | 'under_review' | 'published' | 'archived';

export type StatusBadgeTone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'new'
  | 'active'
  | 'completed'
  | 'important'
  | 'error'
  | 'ai';

type StatusBadgeSize = 'sm' | 'md';

type StatusBadgeProps = {
  children?: ReactNode;
  tone?: StatusBadgeTone;
  size?: StatusBadgeSize;

  /**
   * Backward compatibility.
   * New code can pass icons directly as children:
   * <StatusBadge><Icon /> Label</StatusBadge>
   */
  icon?: ReactNode;

  /**
   * Course status shortcut.
   * Allows <StatusBadge status="published" />.
   */
  status?: CourseStatus | string | null;

  className?: string;
};

type CourseAccessBadgeProps = {
  accessType?: string | null;
  className?: string;
};

type CourseStatusBadgeProps = {
  status?: string | null;
  className?: string;
};

type LessonStatusBadgeProps = {
  status?: 'completed' | 'current' | 'locked' | 'available' | string | null;
  className?: string;
};

type OrderStatusBadgeProps = {
  status?: string | null;
  className?: string;
};

const toneClassMap: Record<StatusBadgeTone, string> = {
  default: 'border-border bg-card text-muted-foreground',
  muted: 'border-border bg-muted text-muted-foreground',

  primary: 'border-primary-muted bg-primary-soft text-primary',
  secondary: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',

  success: 'border-success-muted bg-success-soft text-success-foreground',
  warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
  danger: 'border-destructive-muted bg-destructive-soft text-destructive',

  /**
   * Legacy alias.
   * Keep it because older files may still call tone="info".
   */
  info: 'border-primary-muted bg-primary-soft text-primary',

  new: 'border-status-new/70 bg-status-new text-status-new-foreground',
  active: 'border-status-active/70 bg-status-active text-status-active-foreground',
  completed:
    'border-status-completed/70 bg-status-completed text-status-completed-foreground',
  important:
    'border-status-important/70 bg-status-important text-status-important-foreground',
  error: 'border-status-error/70 bg-status-error text-status-error-foreground',

  ai: 'border-ai-border bg-ai-soft text-ai-foreground',
};

const sizeClassMap: Record<StatusBadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

const courseStatusMeta: Record<
  CourseStatus,
  {
    label: string;
    tone: StatusBadgeTone;
    icon: ReactNode;
  }
> = {
  draft: {
    label: 'Draft',
    tone: 'completed',
    icon: <EyeOff size={12} />,
  },
  review: {
    label: 'Тексерісте',
    tone: 'important',
    icon: <Clock size={12} />,
  },
  under_review: {
    label: 'Тексерісте',
    tone: 'important',
    icon: <Clock size={12} />,
  },
  published: {
    label: 'Жарияланған',
    tone: 'active',
    icon: <CheckCircle2 size={12} />,
  },
  archived: {
    label: 'Архивте',
    tone: 'muted',
    icon: <Archive size={12} />,
  },
};

function isKnownCourseStatus(value: string | null | undefined): value is CourseStatus {
  return Boolean(value && value in courseStatusMeta);
}

export default function StatusBadge({
  children,
  tone = 'default',
  size = 'sm',
  icon,
  status,
  className,
}: StatusBadgeProps) {
  const statusMeta = isKnownCourseStatus(status) ? courseStatusMeta[status] : null;
  const resolvedTone = statusMeta?.tone || tone;
  const resolvedIcon = icon || statusMeta?.icon || null;
  const label = children || statusMeta?.label || null;

  if (!label) {
    return null;
  }

  return (
    <span
      className={cn(
        [
          'inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border',
          'font-semibold leading-none shadow-none',
          'transition-all duration-200 ease-soft',
          'focus:outline-none focus:ring-2 focus:ring-ring/35 focus:ring-offset-2 focus:ring-offset-background',
          '[&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
        ].join(' '),
        toneClassMap[resolvedTone],
        sizeClassMap[size],
        className
      )}
    >
      {resolvedIcon ? <span className="shrink-0">{resolvedIcon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function CourseAccessBadge({
  accessType,
  className,
}: CourseAccessBadgeProps) {
  const normalizedAccessType =
    accessType === 'subscription_only'
      ? 'paid'
      : accessType === 'school_only'
        ? 'private_invite'
        : accessType === 'closed'
          ? 'private_invite'
          : accessType === 'open'
            ? 'public_free'
            : accessType || 'public_free';

  if (normalizedAccessType === 'public_free') {
    return (
      <StatusBadge tone="success" className={className}>
        <Eye size={12} />
        Ашық
      </StatusBadge>
    );
  }

  if (normalizedAccessType === 'private_invite') {
    return (
      <StatusBadge tone="primary" className={className}>
        <KeyRound size={12} />
        Жабық
      </StatusBadge>
    );
  }

  if (normalizedAccessType === 'paid') {
    return (
      <StatusBadge tone="important" className={className}>
        <CreditCard size={12} />
        Ақылы
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" className={className}>
      <Lock size={12} />
      Белгісіз
    </StatusBadge>
  );
}

export function CourseStatusBadge({
  status,
  className,
}: CourseStatusBadgeProps) {
  if (isKnownCourseStatus(status)) {
    return <StatusBadge status={status} className={className} />;
  }

  return (
    <StatusBadge tone="muted" className={className}>
      <Lock size={12} />
      Белгісіз
    </StatusBadge>
  );
}

export function LessonStatusBadge({
  status,
  className,
}: LessonStatusBadgeProps) {
  if (status === 'completed') {
    return (
      <StatusBadge tone="success" className={className}>
        <CheckCircle2 size={12} />
        Аяқталған
      </StatusBadge>
    );
  }

  if (status === 'current') {
    return (
      <StatusBadge tone="ai" className={className}>
        <Sparkles size={12} />
        Қазір оқу
      </StatusBadge>
    );
  }

  if (status === 'locked') {
    return (
      <StatusBadge tone="muted" className={className}>
        <Lock size={12} />
        Құлыпталған
      </StatusBadge>
    );
  }

  if (status === 'available') {
    return (
      <StatusBadge tone="active" className={className}>
        <Eye size={12} />
        Ашық
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" className={className}>
      <Clock size={12} />
      Белгісіз
    </StatusBadge>
  );
}

export function OrderStatusBadge({
  status,
  className,
}: OrderStatusBadgeProps) {
  if (status === 'pending') {
    return (
      <StatusBadge tone="warning" className={className}>
        <Clock size={12} />
        Сұраныс қаралуда
      </StatusBadge>
    );
  }

  if (status === 'approved' || status === 'paid' || status === 'active') {
    return (
      <StatusBadge tone="success" className={className}>
        <ShieldCheck size={12} />
        Расталған
      </StatusBadge>
    );
  }

  if (status === 'rejected' || status === 'cancelled' || status === 'failed') {
    return (
      <StatusBadge tone="danger" className={className}>
        <XCircle size={12} />
        Қабылданбады
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" className={className}>
      <Clock size={12} />
      Белгісіз
    </StatusBadge>
  );
}