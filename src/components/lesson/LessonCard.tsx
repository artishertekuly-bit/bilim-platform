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
import t from '@/lib/i18n';

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
    return <CheckCircle2 size={18} className="text-emerald-600" />;
  }

  if (lesson.isLocked) {
    return <Lock size={18} className="text-muted-foreground" />;
  }

  return <PlayCircle size={18} className="text-primary" />;
}

export default function LessonCard({
  lesson,
  isStudent = false,
  isCompleting = false,
  onOpen,
  onComplete,
}: LessonCardProps) {
  const status = getLessonStatus(lesson);
  const canOpen = !lesson.isLocked;
  const canComplete = isStudent && !lesson.isCompleted && !lesson.isLocked;

  return (
    <div
      className={`
        group rounded-xl border bg-card p-4 transition-all
        ${
          canOpen
            ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
            : 'bg-muted/30 opacity-75'
        }
      `}
      onClick={() => {
        if (canOpen) {
          onOpen?.(lesson);
        }
      }}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onKeyDown={(event) => {
        if (!canOpen) return;

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(lesson);
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background">
          {getLessonIcon(lesson)}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info" icon={<BookOpen size={12} />}>
              {lesson.subjectName}
            </StatusBadge>

            <LessonStatusBadge status={status} />
          </div>

          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold group-hover:underline">
              {lesson.title}
            </h3>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {[lesson.courseTitle, lesson.moduleTitle].filter(Boolean).join(' · ')}
            </p>
          </div>

          {lesson.isLocked ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock size={13} />
              Бұл сабаққа кіру үшін алдыңғы шарттарды орындау қажет.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:min-w-[130px]">
          {canComplete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isCompleting}
              onClick={(event) => {
                event.stopPropagation();
                onComplete?.(lesson);
              }}
            >
              {isCompleting ? t('common.loading') : t('lesson.action.complete')}
            </Button>
          ) : null}

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
              {lesson.isCompleted ? 'Қайта қарау' : 'Сабақты ашу'}
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