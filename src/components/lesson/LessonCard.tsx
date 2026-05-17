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
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type LessonCardProps = {
  lesson: LessonView;
  isStudent?: boolean;
  isCompleting?: boolean;
  onOpen?: (lesson: LessonView) => void;
  onComplete?: (lesson: LessonView) => void;
};

const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_ARIA_CHARS = 260;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

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
  if (lesson.isLocked) return 'Жабық';

  return 'Сабақты ашу';
}

function getLessonMeta(lesson: LessonView) {
  return [lesson.courseTitle, lesson.moduleTitle]
    .map((item) => cleanText(item, MAX_META_CHARS))
    .filter(Boolean)
    .join(' · ');
}

function getLessonTitle(lesson: LessonView) {
  return cleanText(lesson.title, MAX_TITLE_CHARS) || 'Сабақ';
}

function getSubjectName(lesson: LessonView) {
  return cleanText(lesson.subjectName, MAX_META_CHARS) || 'Пән';
}

function getAriaLabel(lesson: LessonView, canOpen: boolean) {
  const title = getLessonTitle(lesson);

  return cleanText(
    canOpen ? `${title} сабағын ашу` : `${title} сабағы жабық`,
    MAX_ARIA_CHARS,
  );
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
  const title = getLessonTitle(lesson);
  const subjectName = getSubjectName(lesson);
  const meta = getLessonMeta(lesson);

  const handleOpen = () => {
    if (!canOpen) return;

    onOpen?.(lesson);
  };

  const handleComplete = () => {
    if (!canOpen || lesson.isCompleted || isCompleting) return;

    onComplete?.(lesson);
  };

  const canComplete =
    Boolean(onComplete) && isStudent && canOpen && !lesson.isCompleted;

  return (
    <div
      className={cn(
        'rounded-3xl border p-4 transition-colors',
        canOpen
          ? 'cursor-pointer border-border bg-card hover:border-primary-muted hover:bg-primary-soft/25 active:scale-[0.995]'
          : 'border-border bg-muted/35 opacity-80',
      )}
      onClick={handleOpen}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-disabled={!canOpen}
      aria-label={getAriaLabel(lesson, canOpen)}
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
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            getIconToneClassName(lesson),
          )}
        >
          {getLessonIcon(lesson)}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="primary">
              <BookOpen size={12} />
              {subjectName}
            </StatusBadge>

            <LessonStatusBadge status={status} />
          </div>

          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">
              {title}
            </h3>

            {meta ? (
              <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                {meta}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:min-w-[132px]">
          <Button
            type="button"
            size="sm"
            variant={lesson.isCompleted ? 'outline' : 'default'}
            disabled={!canOpen}
            onClick={(event) => {
              event.stopPropagation();
              handleOpen();
            }}
          >
            {lesson.isLocked ? (
              <Lock size={14} className="mr-1.5" />
            ) : null}

            {getOpenButtonLabel(lesson)}

            {canOpen ? <ArrowRight size={14} className="ml-1.5" /> : null}
          </Button>

          {canComplete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isCompleting}
              onClick={(event) => {
                event.stopPropagation();
                handleComplete();
              }}
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              {isCompleting ? 'Сақталуда...' : 'Аяқталды'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}