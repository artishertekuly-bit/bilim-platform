import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  Megaphone,
  Pin,
  Save,
  Trash2,
  X,
} from 'lucide-react';

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

function FieldBlock({
  label,
  children,
  required,
}: {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function getPriorityTone(priority: CourseAnnouncementPriority) {
  if (priority === 'urgent') return 'danger' as const;
  if (priority === 'important') return 'warning' as const;
  return 'secondary' as const;
}

function InlineDeleteConfirm({
  disabled,
  onConfirm,
  onCancel,
}: {
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-foreground">
        Хабарландыру өшірілсін бе?
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled}
          onClick={onConfirm}
        >
          <Trash2 size={13} className="mr-2" />
          Өшіру
        </Button>

        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Болдырмау
        </Button>
      </div>
    </div>
  );
}

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
  const [deleteAnnouncement, setDeleteAnnouncement] =
    useState<CourseAnnouncementView | null>(null);

  const editing = Boolean(editingAnnouncementId);
  const saving = creatingAnnouncement || updatingAnnouncement;
  const formComplete =
    announcementForm.title.trim().length > 0 &&
    announcementForm.body.trim().length > 0;

  const handleConfirmedDelete = () => {
    if (!deleteAnnouncement) return;

    onDeleteAnnouncement(deleteAnnouncement);
    setDeleteAnnouncement(null);
  };

  return (
    <Card id="announcements" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="secondary">
              {courseAnnouncements.length}
            </StatusBadge>

            {editing ? (
              <StatusBadge tone="primary">Өңдеу</StatusBadge>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <section className="rounded-3xl border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                <Megaphone size={17} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {editing ? 'Хабарландыруды өңдеу' : 'Жаңа хабарландыру'}
                </p>

                <StatusBadge tone={getPriorityTone(announcementForm.priority)}>
                  {getAnnouncementPriorityLabel(announcementForm.priority)}
                </StatusBadge>

                {announcementForm.isPinned ? (
                  <StatusBadge tone="primary">
                    <Pin size={12} />
                    Бекітілген
                  </StatusBadge>
                ) : null}
              </div>
            </div>

            <StatusBadge tone={formComplete ? 'success' : 'muted'}>
              {formComplete ? 'Толды' : 'Міндетті'}
            </StatusBadge>
          </div>

          <div className="space-y-4">
            <FieldBlock label="Тақырып" required>
              <Input
                value={announcementForm.title}
                onChange={(event) =>
                  setAnnouncementForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder="Тақырып"
              />
            </FieldBlock>

            <FieldBlock label="Мәтін" required>
              <Textarea
                rows={4}
                value={announcementForm.body}
                onChange={(event) =>
                  setAnnouncementForm((previous) => ({
                    ...previous,
                    body: event.target.value,
                  }))
                }
                placeholder="Мәтін"
              />
            </FieldBlock>

            <div className="grid gap-3 md:grid-cols-2">
              <FieldBlock label="Маңыздылығы">
                <select
                  value={announcementForm.priority}
                  onChange={(event) =>
                    setAnnouncementForm((previous) => ({
                      ...previous,
                      priority: event.target.value as CourseAnnouncementPriority,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
                >
                  {announcementPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {getAnnouncementPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </FieldBlock>

              <FieldBlock label="Мерзімі">
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
              </FieldBlock>
            </div>

            <div
              className={`rounded-3xl border p-4 transition-colors ${
                announcementForm.isPinned
                  ? 'border-primary-muted bg-primary-soft/60'
                  : 'border-border bg-muted/25'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                      announcementForm.isPinned
                        ? 'border-primary-muted bg-card text-primary'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    <Pin size={17} />
                  </div>

                  <Label
                    htmlFor="announcement-pinned"
                    className="text-sm font-semibold text-foreground"
                  >
                    Жоғарыға бекіту
                  </Label>
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
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetAnnouncementForm}
                >
                  <X size={14} className="mr-1.5" />
                  Болдырмау
                </Button>
              ) : null}

              <Button
                type="button"
                onClick={onSaveAnnouncement}
                disabled={!canSaveAnnouncement || saving}
              >
                {editing ? (
                  <Save size={14} className="mr-1.5" />
                ) : (
                  <Megaphone size={14} className="mr-1.5" />
                )}
                {editing
                  ? updatingAnnouncement
                    ? 'Жаңартылуда...'
                    : 'Жаңарту'
                  : creatingAnnouncement
                    ? 'Жариялануда...'
                    : 'Жариялау'}
              </Button>
            </div>
          </div>
        </section>

        {courseAnnouncementsLoading ? (
          <LoadingState text="Жүктелуде..." compact size="sm" />
        ) : null}

        {!courseAnnouncementsLoading && courseAnnouncements.length === 0 ? (
          <EmptyState
            title="Хабарландыру жоқ"
            text="Хабарландыру жариялаңыз."
            compact
          />
        ) : null}

        {!courseAnnouncementsLoading && courseAnnouncements.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-muted/25 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Жарияланған хабарландырулар
              </p>

              <StatusBadge tone="muted">{courseAnnouncements.length}</StatusBadge>
            </div>

            {deleteAnnouncement ? (
              <InlineDeleteConfirm
                disabled={deletingAnnouncement}
                onConfirm={handleConfirmedDelete}
                onCancel={() => setDeleteAnnouncement(null)}
              />
            ) : null}

            <div className="space-y-2">
              {courseAnnouncements.map((announcement) => (
                <CourseAnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  onEdit={(item) => {
                    setDeleteAnnouncement(null);
                    onEditAnnouncement(item);
                  }}
                  onDelete={setDeleteAnnouncement}
                  deleting={deletingAnnouncement}
                />
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}