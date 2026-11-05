import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Save,
  Settings,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { CourseThumbnailUploader } from '@/components/course-builder/CourseThumbnailUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  CourseAccessType,
  CourseVisibility,
  SubjectRow,
} from '@/lib/app-data-types';
import {
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';
import { removeNullCharacters } from '@/lib/utils';

type CourseEditForm = {
  title: string;
  description: string;
  subjectId: string;
  thumbnailUrl: string;
  status: CourseStatus;
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  enrollmentOpen: boolean;
  maxStudents: string;
};

type CourseSettingsCardProps = {
  userId: string;
  courseEdit: CourseEditForm;
  setCourseEdit: Dispatch<SetStateAction<CourseEditForm>>;
  subjectOptions: SubjectRow[];
  selectedCoursePrice?: string;
  updating: boolean;
  onSaveCourse: () => void;
};

const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 1_200;

function getStatusTone(status: CourseStatus) {
  if (status === 'published') return 'active' as const;
  if (status === 'archived') return 'muted' as const;

  return 'completed' as const;
}

function getStatusLabel(status: CourseStatus) {
  if (status === 'published') return t('course.status.published');
  if (status === 'archived') return t('course.status.archived');

  return t('course.status.draft');
}

function sanitizeInputValue(value: string, limit: number): string {
  return removeNullCharacters(value).slice(0, limit);
}

function FieldBlock({
  label,
  children,
  required = false,
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

function CompactSection({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface-soft/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
            {icon}
          </span>

          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>

        {aside}
      </div>

      {children}
    </section>
  );
}

export function CourseSettingsCard({
  userId,
  courseEdit,
  setCourseEdit,
  subjectOptions,
  updating,
  onSaveCourse,
}: CourseSettingsCardProps) {
  const [thumbnailUploading, setThumbnailUploading] = useState(false);

  const basicsComplete = useMemo(
    () =>
      courseEdit.title.trim().length > 0 &&
      courseEdit.description.trim().length > 0 &&
      courseEdit.subjectId.trim().length > 0,
    [courseEdit.description, courseEdit.subjectId, courseEdit.title],
  );

  const updateCourseField = <K extends keyof CourseEditForm>(
    key: K,
    value: CourseEditForm[K],
  ) => {
    setCourseEdit((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  return (
    <Card id="course-settings" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Курс баптаулары</CardTitle>

          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={getStatusTone(courseEdit.status)}>
              {getStatusLabel(courseEdit.status)}
            </StatusBadge>

            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {basicsComplete ? 'Дайын' : 'Толтырыңыз'}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <CompactSection
          title="Негізгі ақпарат"
          icon={<Settings size={16} />}
          aside={
            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? 'Дайын' : 'Толтырыңыз'}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            <FieldBlock
              label={t('page.teacher_course_builder.field.course_title')}
              required
            >
              <Input
                value={courseEdit.title}
                maxLength={MAX_TITLE_CHARS}
                onChange={(event) =>
                  updateCourseField(
                    'title',
                    sanitizeInputValue(event.target.value, MAX_TITLE_CHARS),
                  )
                }
                placeholder={t(
                  'page.teacher_course_builder.placeholder.course_title',
                )}
              />
            </FieldBlock>

            <FieldBlock label="Курс сипаттамасы" required>
              <Textarea
                rows={3}
                value={courseEdit.description}
                maxLength={MAX_DESCRIPTION_CHARS}
                onChange={(event) =>
                  updateCourseField(
                    'description',
                    sanitizeInputValue(
                      event.target.value,
                      MAX_DESCRIPTION_CHARS,
                    ),
                  )
                }
                placeholder="Курстың қысқаша мазмұны мен мақсаты"
              />
            </FieldBlock>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock
                label={t('page.teacher_course_builder.field.subject')}
                required
              >
                <select
                  value={courseEdit.subjectId}
                  onChange={(event) =>
                    updateCourseField('subjectId', event.target.value)
                  }
                  className="input-shell"
                >
                  <option value="">Пәнді таңдаңыз</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name_kk}
                    </option>
                  ))}
                </select>
              </FieldBlock>

              <FieldBlock label="Статус">
                <select
                  value={courseEdit.status}
                  onChange={(event) =>
                    updateCourseField(
                      'status',
                      event.target.value as CourseStatus,
                    )
                  }
                  className="input-shell"
                >
                  <option value="draft">{t('course.status.draft')}</option>
                  <option value="published">
                    {t('course.status.published')}
                  </option>
                  <option value="archived">
                    {t('course.status.archived')}
                  </option>
                </select>
              </FieldBlock>
            </div>

            <FieldBlock label={t('page.teacher_course_builder.field.thumbnail')}>
              <CourseThumbnailUploader
                userId={userId}
                value={courseEdit.thumbnailUrl}
                onChange={(url) => updateCourseField('thumbnailUrl', url)}
                onUploadingChange={setThumbnailUploading}
                disabled={updating}
              />
            </FieldBlock>
          </div>
        </CompactSection>

        <Button
          type="button"
          className="w-full"
          disabled={updating || thumbnailUploading || !basicsComplete}
          onClick={onSaveCourse}
        >
          <Save size={15} className="mr-2" />
          {updating
            ? 'Сақталуда...'
            : thumbnailUploading
              ? 'Сурет жүктелуде...'
              : 'Өзгерістерді сақтау'}
        </Button>
      </CardContent>
    </Card>
  );
}
