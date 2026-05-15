import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Lock,
  PlayCircle,
} from 'lucide-react';

import StatusBadge, { LessonStatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import type { LessonView } from '@/lib/app-data-types';
import { cn } from '@/lib/utils';

type LessonCardProps = {
  lesson: LessonView;
  isStudent?: boolean;
  isCompleting?: boolean;
  onOpen?: (lesson: LessonView) => void;
  onComplete?: (lesson: LessonView) => void;
};

function getLessonStatus(lesson: LessonView) {
  if (lesson.isCompleted) return 'completed';
  if (lesson.isLocked) return 'locked';
  return 'available';
}

function getLessonIcon(lesson: LessonView) {
  if (lesson.isCompleted) {
    return <CheckCircle2 size={18} />;
  }

  if (lesson.isLocked) {
    return <Lock size={18} />;
  }

  return <PlayCircle size={18} />;
}

function getIconToneClassName(lesson: LessonView) {
  if (lesson.isCompleted) {
    return 'border-success-muted bg-success-soft text-success-foreground';
  }

  if (lesson.isLocked) {
    return 'border-border bg-muted text-muted-foreground';
  }

  return 'border-primary-muted bg-primary-soft text-primary';
}

function getOpenButtonLabel(lesson: LessonView) {
  if (lesson.isCompleted) return 'Қайта қарау';
  return 'Сабақты ашу';
}

export default function LessonCard({ lesson, onOpen }: LessonCardProps) {
  const status = getLessonStatus(lesson);
  const canOpen = !lesson.isLocked;

  const handleOpen = () => {
    if (!canOpen) return;
    onOpen?.(lesson);
  };

  return (
    <div
      className={cn(
        'rounded-3xl border p-4 transition-colors',
        canOpen
          ? 'cursor-pointer border-border bg-card hover:border-primary-muted hover:bg-primary-soft/25 active:scale-[0.995]'
          : 'border-border bg-muted/35 opacity-80'
      )}
      onClick={handleOpen}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-disabled={!canOpen}
      aria-label={canOpen ? `${lesson.title} сабағын ашу` : `${lesson.title} сабағы жабық`}
      onKeyDown={(event) => {
        if (!canOpen) return;

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOpen();
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
            getIconToneClassName(lesson)
          )}
        >
          {getLessonIcon(lesson)}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="primary">
              <BookOpen size={12} />
              {lesson.subjectName}
            </StatusBadge>

            <LessonStatusBadge status={status} />
          </div>

          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
              {lesson.title}
            </h3>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {[lesson.courseTitle, lesson.moduleTitle].filter(Boolean).join(' · ')}
            </p>
          </div>

          {lesson.isLocked ? (
            <p className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <Lock size={13} />
              Жабық
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:min-w-[130px]">
          {canOpen ? (
            <Button
              type="button"
              size="sm"
              variant={lesson.isCompleted ? 'outline' : 'default'}
              onClick={(event) => {
                event.stopPropagation();
                onOpen?.(lesson);
              }}
            >
              {getOpenButtonLabel(lesson)}
              <ArrowRight size={14} className="ml-1.5" />
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled>
              <Lock size={14} className="mr-1.5" />
              Жабық
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}