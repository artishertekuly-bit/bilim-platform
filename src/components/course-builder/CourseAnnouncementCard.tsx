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
      className={`rounded-lg border p-3 text-sm ${
        expired ? 'bg-muted/40 opacity-75' : 'bg-card'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={getAnnouncementPriorityTone(announcement.priority)}>
              {getAnnouncementPriorityLabel(announcement.priority)}
            </StatusBadge>

            {announcement.isPinned ? (
              <StatusBadge tone="primary" icon={<Pin size={12} />}>
                Бекітілген
              </StatusBadge>
            ) : null}

            {expired ? (
              <StatusBadge tone="muted" icon={<CalendarClock size={12} />}>
                Мерзімі өткен
              </StatusBadge>
            ) : null}
          </div>

          <p className="font-semibold">{announcement.title}</p>

          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {announcement.body}
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>Жарияланды: {formatDateTime(announcement.publishedAt)}</span>
            <span>Мерзімі: {formatDateTime(announcement.expiresAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(announcement)}
          >
            <Pencil size={13} />
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            disabled={deleting}
            onClick={() => onDelete(announcement)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}
