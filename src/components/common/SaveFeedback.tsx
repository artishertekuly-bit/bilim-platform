import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type SaveFeedbackStatus = 'idle' | 'saving' | 'saved' | 'error';

type SaveFeedbackProps = {
  status: SaveFeedbackStatus;
  className?: string;
};

const meta = {
  idle: { label: 'Өзгеріс жоқ', icon: null, className: 'border-border bg-card text-muted-foreground' },
  saving: { label: 'Сақталуда…', icon: Loader2, className: 'border-primary-muted bg-primary-soft text-primary' },
  saved: { label: 'Сақталды', icon: CheckCircle2, className: 'border-success-muted bg-success-soft text-success-foreground' },
  error: { label: 'Сақтау қатесі', icon: XCircle, className: 'border-destructive-muted bg-destructive-soft text-destructive' },
} satisfies Record<SaveFeedbackStatus, { label: string; icon: typeof CheckCircle2 | typeof Loader2 | typeof XCircle | null; className: string }>;

export default function SaveFeedback({ status, className }: SaveFeedbackProps) {
  const item = meta[status];
  const Icon = item.icon;

  return (
    <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold', item.className, className)}>
      {Icon ? <Icon className={cn('h-3.5 w-3.5', status === 'saving' && 'animate-spin')} /> : null}
      {item.label}
    </span>
  );
}
