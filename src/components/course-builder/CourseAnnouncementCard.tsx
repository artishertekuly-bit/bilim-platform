import { CalendarClock, Pencil, Pin, Trash2 } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import type { CourseAnnouncementView } from '@/lib/app-data-types';
import {
  formatDateTime,
  getAnnouncementPriorityLabel,
  getAnnouncementPriorityTone,
  isExpiredDate,
} from '@/lib/course-creator/course-builder-utils';

function getAnnouncementCardClassName({
  expired,
  priority,
}: {
  expired: boolean;
  priority: CourseAnnouncementView['priority'];
}) {
  if (expired) {
    return 'border-border bg-muted/40 opacity-80';
  }

  if (priority === 'urgent') {
    return 'border-destructive-muted bg-destructive-soft/45';
  }

  if (priority === 'important') {
    return 'border-warning-muted bg-warning-soft/45';
  }

  return 'border-border bg-card';
}

function DatePill({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
      <CalendarClock size={11} />
      <span className="font-medium">{label}:</span>
      <span>{formatDateTime(value)}</span>
    </span>
  );
}

export function CourseAnnouncementCard({
  announcement,
  onEdit,
  onDelete,
  deleting,
}: {
  announcement: CourseAnnouncementView;
  onEdit: (announcement: CourseAnnouncementView) => void;
  onDelete: (announcement: CourseAnnouncementView) => void;
  deleting: boolean;
}) {
  const expired = announcement.isExpired || isExpiredDate(announcement.expiresAt);

  return (
    <div
      className={`rounded-3xl border p-4 text-sm transition-colors ${getAnnouncementCardClassName(
        {
          expired,
          priority: announcement.priority,
        },
      )}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={getAnnouncementPriorityTone(announcement.priority)}>
              {getAnnouncementPriorityLabel(announcement.priority)}
            </StatusBadge>

            {announcement.isPinned ? (
              <StatusBadge tone="primary">
                <Pin size={12} />
                Бекітілген
              </StatusBadge>
            ) : null}

            {expired ? (
              <StatusBadge tone="muted">
                <CalendarClock size={12} />
                Мерзімі өткен
              </StatusBadge>
            ) : null}
          </div>

          <p className="line-clamp-2 font-semibold leading-6 text-foreground">
            {announcement.title}
          </p>

          <p className="mt-1 line-clamp-5 whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {announcement.body}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <DatePill label="Жарияланды" value={announcement.publishedAt} />
            <DatePill label="Аяқталады" value={announcement.expiresAt} />
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={deleting}
            onClick={() => onEdit(announcement)}
            aria-label="Хабарландыруды өңдеу"
          >
            <Pencil size={13} />
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            disabled={deleting}
            onClick={() => onDelete(announcement)}
            aria-label="Хабарландыруды өшіру"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}