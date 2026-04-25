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

type StatusBadgeTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'
  | 'primary';

type StatusBadgeSize = 'sm' | 'md';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
  size?: StatusBadgeSize;
  icon?: ReactNode;
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const toneClassMap: Record<StatusBadgeTone, string> = {
  default: 'border-border bg-card text-foreground',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  muted: 'border-border bg-muted text-muted-foreground',
  primary: 'border-primary/20 bg-primary/10 text-primary',
};

const sizeClassMap: Record<StatusBadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export default function StatusBadge({
  children,
  tone = 'default',
  size = 'sm',
  icon,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-full border font-medium leading-none',
        toneClassMap[tone],
        sizeClassMap[size],
        className
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children}</span>
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
        : accessType || 'public_free';

  if (normalizedAccessType === 'public_free') {
    return (
      <StatusBadge
        tone="success"
        icon={<Eye size={12} />}
        className={className}
      >
        Ашық
      </StatusBadge>
    );
  }

  if (normalizedAccessType === 'private_invite') {
    return (
      <StatusBadge
        tone="info"
        icon={<KeyRound size={12} />}
        className={className}
      >
        Жабық
      </StatusBadge>
    );
  }

  if (normalizedAccessType === 'paid') {
    return (
      <StatusBadge
        tone="warning"
        icon={<CreditCard size={12} />}
        className={className}
      >
        Ақылы
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={<Lock size={12} />} className={className}>
      Белгісіз
    </StatusBadge>
  );
}

export function CourseStatusBadge({
  status,
  className,
}: CourseStatusBadgeProps) {
  if (status === 'published') {
    return (
      <StatusBadge
        tone="success"
        icon={<CheckCircle2 size={12} />}
        className={className}
      >
        Жарияланған
      </StatusBadge>
    );
  }

  if (status === 'draft') {
    return (
      <StatusBadge tone="muted" icon={<EyeOff size={12} />} className={className}>
        Draft
      </StatusBadge>
    );
  }

  if (status === 'under_review') {
    return (
      <StatusBadge tone="warning" icon={<Clock size={12} />} className={className}>
        Тексерісте
      </StatusBadge>
    );
  }

  if (status === 'archived') {
    return (
      <StatusBadge tone="muted" icon={<Archive size={12} />} className={className}>
        Архивте
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={<Lock size={12} />} className={className}>
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
      <StatusBadge
        tone="success"
        icon={<CheckCircle2 size={12} />}
        className={className}
      >
        Аяқталған
      </StatusBadge>
    );
  }

  if (status === 'current') {
    return (
      <StatusBadge
        tone="primary"
        icon={<Sparkles size={12} />}
        className={className}
      >
        Қазір оқу
      </StatusBadge>
    );
  }

  if (status === 'locked') {
    return (
      <StatusBadge tone="muted" icon={<Lock size={12} />} className={className}>
        Құлыпталған
      </StatusBadge>
    );
  }

  if (status === 'available') {
    return (
      <StatusBadge tone="info" icon={<Eye size={12} />} className={className}>
        Ашық
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={<Clock size={12} />} className={className}>
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
      <StatusBadge tone="warning" icon={<Clock size={12} />} className={className}>
        Сұраныс қаралуда
      </StatusBadge>
    );
  }

  if (status === 'approved' || status === 'paid' || status === 'active') {
    return (
      <StatusBadge
        tone="success"
        icon={<ShieldCheck size={12} />}
        className={className}
      >
        Расталған
      </StatusBadge>
    );
  }

  if (status === 'rejected' || status === 'cancelled' || status === 'failed') {
    return (
      <StatusBadge tone="danger" icon={<XCircle size={12} />} className={className}>
        Қабылданбады
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={<Clock size={12} />} className={className}>
      Белгісіз
    </StatusBadge>
  );
}