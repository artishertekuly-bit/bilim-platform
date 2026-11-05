import { Children, isValidElement, type ReactNode } from 'react';
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

import { cn, limitText, removeNullCharacters } from '@/lib/utils';

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
  icon?: ReactNode;
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

const MAX_BADGE_LABEL_CHARS = 80;
const MAX_STATUS_CHARS = 80;

const toneClassMap: Record<StatusBadgeTone, string> = {
  default: 'border-border bg-card text-muted-foreground',
  muted: 'border-border bg-muted text-muted-foreground',

  primary: 'border-primary-muted bg-primary-soft text-primary',
  secondary: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',

  success: 'border-success-muted bg-success-soft text-success-foreground',
  warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
  danger: 'border-destructive-muted bg-destructive-soft text-destructive',

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
    label: 'Жоба',
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

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_BADGE_LABEL_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeKey(value: unknown): string {
  return cleanText(value, MAX_STATUS_CHARS).toLowerCase();
}

function normalizeBadgeChildren(children: ReactNode): ReactNode {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return null;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return cleanText(children);
  }

  if (Array.isArray(children)) {
    return Children.map(children, normalizeBadgeChildren);
  }

  if (isValidElement(children)) {
    return children;
  }

  return children;
}

function isKnownCourseStatus(value: string | null | undefined): value is CourseStatus {
  const normalized = normalizeKey(value);

  return normalized in courseStatusMeta;
}

function getKnownCourseStatus(value: string | null | undefined): CourseStatus | null {
  const normalized = normalizeKey(value);

  return isKnownCourseStatus(normalized) ? normalized : null;
}

export default function StatusBadge({
  children,
  tone = 'default',
  size = 'sm',
  icon,
  status,
  className,
}: StatusBadgeProps) {
  const knownStatus = getKnownCourseStatus(status);
  const statusMeta = knownStatus ? courseStatusMeta[knownStatus] : null;

  const resolvedTone = statusMeta?.tone || tone;
  const resolvedIcon = icon || statusMeta?.icon || null;
  const label = normalizeBadgeChildren(children || statusMeta?.label || null);

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
        className,
      )}
    >
      {resolvedIcon ? <span className="shrink-0">{resolvedIcon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function CourseAccessBadge(_props: CourseAccessBadgeProps) {
  return null;
}

export function CourseStatusBadge({
  status,
  className,
}: CourseStatusBadgeProps) {
  const knownStatus = getKnownCourseStatus(status);

  if (knownStatus) {
    return <StatusBadge status={knownStatus} className={className} />;
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
  const normalizedStatus = normalizeKey(status);

  if (normalizedStatus === 'completed') {
    return (
      <StatusBadge tone="success" className={className}>
        <CheckCircle2 size={12} />
        Аяқталған
      </StatusBadge>
    );
  }

  if (normalizedStatus === 'current') {
    return (
      <StatusBadge tone="ai" className={className}>
        <Sparkles size={12} />
        Қазір оқу
      </StatusBadge>
    );
  }

  if (normalizedStatus === 'locked') {
    return (
      <StatusBadge tone="muted" className={className}>
        <Lock size={12} />
        Құлыпталған
      </StatusBadge>
    );
  }

  if (normalizedStatus === 'available') {
    return null;
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
  const normalizedStatus = normalizeKey(status);

  if (normalizedStatus === 'pending') {
    return (
      <StatusBadge tone="warning" className={className}>
        <Clock size={12} />
        Сұраныс қаралуда
      </StatusBadge>
    );
  }

  if (
    normalizedStatus === 'approved' ||
    normalizedStatus === 'paid' ||
    normalizedStatus === 'active'
  ) {
    return (
      <StatusBadge tone="success" className={className}>
        <ShieldCheck size={12} />
        Расталған
      </StatusBadge>
    );
  }

  if (
    normalizedStatus === 'rejected' ||
    normalizedStatus === 'cancelled' ||
    normalizedStatus === 'failed'
  ) {
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