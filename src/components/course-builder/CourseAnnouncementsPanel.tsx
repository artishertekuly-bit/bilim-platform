import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Megaphone,
  Pin,
  Save,
  X,
} from 'lucide-react';

import { EmptyState, LoadingState } from '@/components/common/DataState';
import StatusBadge from '@/components/common/StatusBadge';
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

const MAX_TITLE_CHARS = 180;
const MAX_BODY_CHARS = 4_000;

function cleanText(value: string, limit: number) {
  return value.replace(/\x00/g, ' ').slice(0, limit);
}

function getPriorityTone(priority: CourseAnnouncementPriority) {
  if (priority === 'urgent') return 'danger' as const;
  if (priority === 'important') return 'warning' as const;

  return 'secondary' as const;
}

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
  const editing = Boolean(editingAnnouncementId);
  const saving = creatingAnnouncement || updatingAnnouncement;
  const formComplete =
    announcementForm.title.trim().length > 0 &&
    announcementForm.body.trim().length > 0;

  const updateAnnouncementField = <K extends keyof CourseAnnouncementFormState>(
    key: K,
    value: CourseAnnouncementFormState[K],
  ) => {
    setAnnouncementForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const saveButtonLabel = editing
    ? updatingAnnouncement
      ? 'Жаңартылуда...'
      : 'Жаңарту'
    : creatingAnnouncement
      ? 'Жариялануда...'
      : 'Жариялау';

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
                maxLength={MAX_TITLE_CHARS}
                onChange={(event) =>
                  updateAnnouncementField(
                    'title',
                    cleanText(event.target.value, MAX_TITLE_CHARS),
                  )
                }
                placeholder="Тақырып"
              />
            </FieldBlock>

            <FieldBlock label="Мәтін" required>
              <Textarea
                rows={4}
                value={announcementForm.body}
                maxLength={MAX_BODY_CHARS}
                onChange={(event) =>
                  updateAnnouncementField(
                    'body',
                    cleanText(event.target.value, MAX_BODY_CHARS),
                  )
                }
                placeholder="Мәтін"
              />

              <p className="text-[11px] text-muted-foreground">
                {announcementForm.body.length}/{MAX_BODY_CHARS}
              </p>
            </FieldBlock>

            <div className="grid gap-3 md:grid-cols-2">
              <FieldBlock label="Маңыздылығы">
                <select
                  value={announcementForm.priority}
                  onChange={(event) =>
                    updateAnnouncementField(
                      'priority',
                      event.target.value as CourseAnnouncementPriority,
                    )
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

              <FieldBlock label="Аяқталу мерзімі">
                <Input
                  type="datetime-local"
                  value={announcementForm.expiresAt}
                  onChange={(event) =>
                    updateAnnouncementField('expiresAt', event.target.value)
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
                    updateAnnouncementField('isPinned', checked)
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
                  disabled={saving}
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
                {saveButtonLabel}
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
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}