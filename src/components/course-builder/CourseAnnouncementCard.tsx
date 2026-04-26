import { CalendarClock, Megaphone, Pencil, Pin, Trash2 } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import type { CourseAnnouncementView } from '@/lib/app-data-types';
import {
  formatDateTime,
  getAnnouncementPriorityLabel,
  getAnnouncementPriorityTone,
  isExpiredDate,
} from '@/lib/course-creator/course-builder-utils';

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
      className={`rounded-3xl border p-4 text-sm shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md ${
        expired
          ? 'border-border bg-muted/55 opacity-80'
          : announcement.priority === 'urgent'
            ? 'border-destructive-muted bg-destructive-soft/65'
            : announcement.priority === 'important'
              ? 'border-warning-muted bg-warning-soft/65'
              : 'border-border bg-card'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${
                expired
                  ? 'border-border bg-card text-muted-foreground'
                  : announcement.priority === 'urgent'
                    ? 'border-destructive-muted bg-card text-destructive'
                    : announcement.priority === 'important'
                      ? 'border-warning-muted bg-card text-warning-foreground'
                      : 'border-primary-muted bg-primary-soft text-primary'
              }`}
            >
              <Megaphone size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={getAnnouncementPriorityTone(announcement.priority)}>
                  <Megaphone size={12} />
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

              <p className="font-semibold leading-6 text-foreground">
                {announcement.title}
              </p>

              <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">
                {announcement.body}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
                  <CalendarClock size={11} />
                  Жарияланды: {formatDateTime(announcement.publishedAt)}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
                  <CalendarClock size={11} />
                  Мерзімі: {formatDateTime(announcement.expiresAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
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