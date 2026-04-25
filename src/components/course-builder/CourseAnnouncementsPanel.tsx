import type { Dispatch, SetStateAction } from 'react';
import { Megaphone } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  CourseAnnouncementPriority,
  CourseAnnouncementView,
} from '@/lib/app-data-types';
import {
  announcementPriorities,
  getAnnouncementPriorityLabel,
  toDateTimeLocalValue,
} from '@/lib/course-creator/course-builder-utils';
import { CourseAnnouncementCard } from './CourseAnnouncementCard';

export type CourseAnnouncementFormState = {
  title: string;
  body: string;
  priority: CourseAnnouncementPriority;
  isPinned: boolean;
  expiresAt: string;
};

type CourseAnnouncementsPanelProps = {
  announcementForm: CourseAnnouncementFormState;
  setAnnouncementForm: Dispatch<SetStateAction<CourseAnnouncementFormState>>;

  editingAnnouncementId: string | null;
  courseAnnouncements: CourseAnnouncementView[];
  courseAnnouncementsLoading: boolean;

  onResetAnnouncementForm: () => void;
  onSaveAnnouncement: () => void;
  onEditAnnouncement: (announcement: CourseAnnouncementView) => void;
  onDeleteAnnouncement: (announcement: CourseAnnouncementView) => void;

  canSaveAnnouncement: boolean;
  creatingAnnouncement: boolean;
  updatingAnnouncement: boolean;
  deletingAnnouncement: boolean;
};

export function CourseAnnouncementsPanel({
  announcementForm,
  setAnnouncementForm,
  editingAnnouncementId,
  courseAnnouncements,
  courseAnnouncementsLoading,
  onResetAnnouncementForm,
  onSaveAnnouncement,
  onEditAnnouncement,
  onDeleteAnnouncement,
  canSaveAnnouncement,
  creatingAnnouncement,
  updatingAnnouncement,
  deletingAnnouncement,
}: CourseAnnouncementsPanelProps) {
  return (
    <Card id="announcements" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <Megaphone size={14} />
            Хабарландырулар
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Бұл бөлім арқылы курсқа қатысты маңызды ақпаратты оқушыларға жариялайсыз.
          Pin қойылған хабарландырулар жоғарыда тұрады.
        </p>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label>Тақырып</Label>
            <Input
              value={announcementForm.title}
              onChange={(event) =>
                setAnnouncementForm((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              placeholder="Мысалы: Ертең бақылау тесті болады"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Мәтін</Label>
            <Textarea
              rows={4}
              value={announcementForm.body}
              onChange={(event) =>
                setAnnouncementForm((previous) => ({
                  ...previous,
                  body: event.target.value,
                }))
              }
              placeholder="Оқушыларға көрсетілетін хабарлама мәтіні..."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Маңыздылығы</Label>
              <select
                value={announcementForm.priority}
                onChange={(event) =>
                  setAnnouncementForm((previous) => ({
                    ...previous,
                    priority: event.target.value as CourseAnnouncementPriority,
                  }))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {announcementPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {getAnnouncementPriorityLabel(priority)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Мерзімі</Label>
              <Input
                type="datetime-local"
                value={announcementForm.expiresAt}
                onChange={(event) =>
                  setAnnouncementForm((previous) => ({
                    ...previous,
                    expiresAt: event.target.value,
                  }))
                }
                min={toDateTimeLocalValue(new Date().toISOString())}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label htmlFor="announcement-pinned">Жоғарыға бекіту</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Pin қойылса, хабарландыру тізімнің басында тұрады.
              </p>
            </div>

            <Switch
              id="announcement-pinned"
              checked={announcementForm.isPinned}
              onCheckedChange={(checked) =>
                setAnnouncementForm((previous) => ({
                  ...previous,
                  isPinned: checked,
                }))
              }
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingAnnouncementId ? (
              <Button
                type="button"
                variant="outline"
                onClick={onResetAnnouncementForm}
              >
                Болдырмау
              </Button>
            ) : null}

            <Button
              type="button"
              onClick={onSaveAnnouncement}
              disabled={!canSaveAnnouncement}
            >
              <Megaphone size={14} className="mr-1.5" />
              {editingAnnouncementId
                ? updatingAnnouncement
                  ? 'Жаңартылуда...'
                  : 'Хабарландыруды жаңарту'
                : creatingAnnouncement
                  ? 'Жариялануда...'
                  : 'Хабарландыру жариялау'}
            </Button>
          </div>
        </div>

        {courseAnnouncementsLoading ? (
          <LoadingState text="Хабарландырулар жүктелуде..." />
        ) : null}

        {!courseAnnouncementsLoading && courseAnnouncements.length === 0 ? (
          <EmptyState
            title="Хабарландыру жоқ"
            text="Курсқа хабарландыру жарияланғаннан кейін осы жерде көрінеді."
          />
        ) : null}

        {!courseAnnouncementsLoading && courseAnnouncements.length > 0 ? (
          <div className="space-y-2">
            {courseAnnouncements.map((announcement) => (
              <CourseAnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onEdit={onEditAnnouncement}
                onDelete={onDeleteAnnouncement}
                deleting={deletingAnnouncement}
              />
            ))}
          </div>
        ) : null}

        {editingAnnouncementId ? (
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <StatusBadge tone="primary">Өңдеу режимі</StatusBadge>
            <span className="ml-2">Сақтау батырмасы осы хабарландыруды жаңартады.</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
