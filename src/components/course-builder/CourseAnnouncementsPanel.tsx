import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  CalendarClock,
  Megaphone,
  Pin,
  Save,
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
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? (
        <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function getPriorityTone(priority: CourseAnnouncementPriority) {
  if (priority === 'urgent') return 'danger' as const;
  if (priority === 'important') return 'warning' as const;
  return 'secondary' as const;
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

  return (
    <Card id="announcements" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Megaphone size={16} />
                Хабарландырулар
              </CardTitle>

              <StatusBadge tone="secondary">
                <Megaphone size={12} />
                {courseAnnouncements.length} хабарлама
              </StatusBadge>

              {editing ? (
                <StatusBadge tone="primary">Өңдеу режимі</StatusBadge>
              ) : null}
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Бұл бөлім арқылы курсқа қатысты маңызды ақпаратты оқушыларға
              жариялайсыз. Pin қойылған хабарландырулар тізімнің жоғары жағында
              тұрады.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <section className="rounded-3xl border border-border bg-surface-soft/55 p-4 shadow-soft">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <Megaphone size={17} />
            </div>

            <div className="min-w-0">
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
                    Pin
                  </StatusBadge>
                ) : null}
              </div>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Хабарландыру оқушыға курс бетінде көрінеді. Маңызды немесе шұғыл
                ақпаратты priority арқылы бөлек белгілеңіз.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldBlock label="Тақырып">
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
            </FieldBlock>

            <FieldBlock label="Мәтін">
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
            </FieldBlock>

            <div className="grid gap-3 md:grid-cols-2">
              <FieldBlock
                label="Маңыздылығы"
                hint="Шұғыл хабарландырулар visually көбірек ерекшеленеді."
              >
                <select
                  value={announcementForm.priority}
                  onChange={(event) =>
                    setAnnouncementForm((previous) => ({
                      ...previous,
                      priority: event.target.value as CourseAnnouncementPriority,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
                >
                  {announcementPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {getAnnouncementPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </FieldBlock>

              <FieldBlock
                label="Мерзімі"
                hint="Бос қалдырсаңыз, хабарландыру мерзімсіз тұрады."
              >
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
              className={`rounded-3xl border p-4 transition-all duration-200 ease-soft ${
                announcementForm.isPinned
                  ? 'border-primary-muted bg-primary-soft/70'
                  : 'border-border bg-card/75'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${
                      announcementForm.isPinned
                        ? 'border-primary-muted bg-card text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    <Pin size={17} />
                  </div>

                  <div className="min-w-0">
                    <Label
                      htmlFor="announcement-pinned"
                      className="text-sm font-semibold text-foreground"
                    >
                      Жоғарыға бекіту
                    </Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Pin қойылса, хабарландыру тізімнің басында тұрады.
                    </p>
                  </div>
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
                    : 'Хабарландыруды жаңарту'
                  : creatingAnnouncement
                    ? 'Жариялануда...'
                    : 'Хабарландыру жариялау'}
              </Button>
            </div>
          </div>
        </section>

        {courseAnnouncementsLoading ? (
          <LoadingState
            text="Хабарландырулар жүктелуде..."
            compact
            size="sm"
          />
        ) : null}

        {!courseAnnouncementsLoading && courseAnnouncements.length === 0 ? (
          <EmptyState
            title="Хабарландыру жоқ"
            text="Курсқа хабарландыру жарияланғаннан кейін осы жерде көрінеді."
            compact
          />
        ) : null}

        {!courseAnnouncementsLoading && courseAnnouncements.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface-soft/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Жарияланған хабарландырулар
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Оқушыларға көрінетін курс хабарламалары.
                </p>
              </div>

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

        {editing ? (
          <div className="rounded-3xl border border-primary-muted bg-primary-soft/55 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <div className="flex items-start gap-2">
              <CalendarClock size={14} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <StatusBadge tone="primary">Өңдеу режимі</StatusBadge>
                <span className="ml-2">
                  Сақтау батырмасы таңдалған хабарландыруды жаңартады.
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}